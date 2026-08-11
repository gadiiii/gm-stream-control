# Offsite test environment

Reproduces the production streaming topology on a laptop and **asserts that one
feed reaches every destination at once** — so the streaming path can be changed
and re-verified any day of the week, without the church's equipment.

```
ffmpeg (on your Mac)               docker-compose stack
 test pattern @ 6 Mbps
 1080p30, running clock ──rtmp──> ┌──────────────────────────┐
                                  │ server                   │
                                  │  nginx-rtmp  :1935 :8080 │──push──> sink-youtube  :8081
                                  │  backend     :8000       │──push──> sink-facebook :8082
                                  └──────────────────────────┘
                                              │
                                    staging Supabase (cloud)
```

nginx and the backend share one container because the backend writes
`nginx.conf` and shells out to `nginx -t` / `nginx -s reload` — it needs the same
filesystem and process space. That is also how the real host is laid out.

The sinks are throwaway nginx-rtmp servers that accept any stream key and expose
`/stat`. **They are the evidence**: if a sink reports a live stream, the push leg
carried real frames.

## One-time setup

Takes about ten minutes. At any point, run this to see exactly what's still
missing — it checks everything below and never changes anything:

```bash
python test-env/check-setup.py
```

### 1. Create a staging Supabase project

At [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
Free tier is fine. Name it something unmistakable like `gm-stream-staging`.

This must not be the project your services use. `seed.py` deletes every
destination in the target, and `verify.py` deliberately corrupts a stream key to
test the failure path.

### 2. Apply the schema

Project → **SQL Editor** → New query. Paste the whole of
`backend/supabase/migrations/001_initial_schema.sql` and run it. It is
re-runnable, so running it twice is harmless.

### 3. Create a test user

**Authentication → Users → Add user → Create new user.** Any email works
(`test@example.com` is fine — it never receives mail).

**Tick "Auto Confirm User."** Without it the user can't sign in, and
`verify.py` signs in as this user to exercise the real auth path.

### 4. Collect the credentials

- **Project URL** — Settings → Data API → *Project URL*
- **Service role key** — Settings → API Keys → `service_role` *secret*.
  Not the anon/publishable key; the checker will tell you if you grab the wrong
  one.

The service_role key bypasses all row-level security. Keep it in
`test-env/.env`, which is gitignored — don't paste it into a chat, a commit, or
an issue.

### 5. Fill in the env file

```bash
cp test-env/.env.example test-env/.env
```

Generate a **separate** encryption key for staging — a different key from
production guarantees a staging key can never decrypt a real one:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Then set `I_KNOW_THIS_IS_STAGING=yes`, which `seed.py` refuses to run without.

### 6. Confirm and start Docker

```bash
python test-env/check-setup.py
```

Fix anything it flags, then start Docker. On this machine that's Colima, not
Docker Desktop:

```bash
colima start
```

## Running it

```bash
docker-compose -f test-env/docker-compose.yml up -d --build
```

```bash
python test-env/seed.py
```

```bash
python test-env/verify.py
```

`verify.py` starts and stops the synthetic feed itself. To drive it by hand
instead — or to watch it in a player — run the feed in its own terminal:

```bash
./test-env/stream.sh
```

and then `python test-env/verify.py --keep-feed`.

To point the dashboard at this stack, set `NEXT_PUBLIC_API_URL=http://localhost:8000`
in `frontend/.env.local` and run `npm run dev`.

## What it checks

| # | Scenario | Guards |
|---|----------|--------|
| 1 | One feed reaches **both** sinks simultaneously | the core fan-out promise |
| 2 | Config has one `push` per enabled destination, no unsupported `resolver`, and passes `nginx -t` | config generation |
| 3 | Toggling a destination mid-stream defers the reload and does not drop the feed | `0adbadc` |
| 4 | One unreadable stream key does not remove the other destination's push | skip-don't-abort |
| 5 | `GET /api/destinations` leaks no stream key or ciphertext | key hygiene |

Run one at a time with `--scenario 1`.

## Testing against the real platforms

Local sinks accept **any** stream key, so a wrong or expired key passes here and
fails on Sunday. To cover that, create `test-env/real-destinations.local.json`
(gitignored):

```json
[
  {"name": "YouTube",  "rtmp_url": "rtmp://a.rtmp.youtube.com/live2",
   "platform_type": "youtube",  "stream_key": "xxxx-xxxx-xxxx-xxxx"},
  {"name": "Facebook", "rtmp_url": "rtmps://live-api-s.facebook.com:443/rtmp",
   "platform_type": "facebook", "stream_key": "FB-xxxxx"}
]
```

```bash
python test-env/seed.py --mode real
./test-env/stream.sh
```

Use an **unlisted** YouTube event and a Facebook test stream. In this mode
`verify.py` can confirm the pushes were configured and the origin went live, but
only the platform dashboards can confirm they were accepted.

The working loop: iterate in local mode (fast, offline, unlimited), then run real
mode once before anything ships.

## What this cannot test

- **Stream key validity.** Local sinks accept anything. Real mode is the only cover.
- **The real network path** to YouTube/Facebook — congestion, RTMPS handshakes,
  platform-side throttling.
- **The ATEM itself.** ffmpeg reproduces the bitstream, not the capture hardware
  or its reconnect behavior.
- **Instagram and the website** — out of scope by decision.

## Teardown

```bash
docker-compose -f test-env/docker-compose.yml down
```
