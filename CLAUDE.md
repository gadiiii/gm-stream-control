# CLAUDE.md

Notes for working in this repo. See [README.md](README.md) for what the project
does and how to run it.

## Layout

- `backend/main.py` — the entire FastAPI backend, single file.
- `frontend/` — Next.js App Router, React 19, Tailwind v4, shadcn components.
- `deploy/` — production provisioning: `setup.sh` plus systemd units.
- `infra/nginx-rtmp/nginx.conf` — Docker dev only.
- `backend/supabase/migrations/` — Postgres schema.

Data lives in hosted Supabase, accessed with the service-role key, so RLS is
bypassed by design. The backend is the only thing that talks to the database.

## Things that will bite you

**There are three nginx configs and only one is authoritative.**
`build_nginx_config` in `backend/main.py` generates the real one at runtime and
overwrites whatever is at `NGINX_CONFIG_PATH`. `deploy/nginx.conf` is only a
seed for a fresh install, and `infra/nginx-rtmp/nginx.conf` is the Docker dev
config, mounted read-only so the backend can never rewrite it. Change the
generator first; mirror into the other two so they don't drift.

**Never add a `resolver` directive to the rtmp block.** Ubuntu's
`libnginx-mod-rtmp` has no such directive in any rtmp context and nginx refuses
to start with it — verified against the real module in `test-env/`. It was added
in 4168d75 and correctly removed in d73ed66; don't "restore" it.

**Push hostnames are resolved when the config LOADS, not when the push starts.**
If DNS is unavailable at that moment, `nginx -t` fails with `host not found in
url` and the *entire* config is rejected — every destination goes down together,
not just the unresolvable one. `deploy/fix-dns.service` exists for this reason.
The failure is quiet from the app's side: the reload fails, the backend rolls
back to the previous config and returns the error in its result rather than
raising, so a destination change can look saved while nginx keeps running the
old config. Check the backend log for "Generated nginx config is invalid".

**Reloading nginx drops whoever is publishing.** `write_nginx_config_and_reload`
writes the new config but defers the reload while a stream is live, setting
`nginx_reload_pending`; the stats poller applies it once nothing is publishing.
A destination toggled mid-stream therefore takes effect when the stream ends —
the UI says so rather than pretending it applied.

**That function never raises.** By the time it runs, the destination change is
already committed, so a reload failure would report failure for a change that
actually saved. It returns the outcome instead. Keep it that way.

**The backend must run single-worker.** `latest_status`, `active_stream_id`,
`peak_viewers`, and `nginx_reload_pending` are module globals. More than one
uvicorn worker gives each its own copy and the deferred-reload logic breaks. The
systemd unit runs one process.

**Stream keys are Fernet-encrypted with `ENCRYPTION_KEY` and never leave the
server.** `GET /api/destinations` returns `has_stream_key`, not the key.
`encrypt_stream_key` rejects a value that is already decryptable — that means a
client sent stored ciphertext back and encrypting it again would produce a
double-encrypted key that decrypts without error into garbage and silently fails
at the platform. `backend/scripts/audit_stream_keys.py` finds rows in that state.

**Testing a stream key means asking the platform to accept a publish.** A TCP
connect proves nothing about the key. `backend/rtmp_probe.py` does a real RTMP
handshake, `connect`, `createStream` and `publish`, then disconnects — no media
is ever sent. Note that many platforms refuse a bad key by *closing the
connection* rather than returning an RTMP error, so "closed right after publish"
is treated as a rejection. Verified against YouTube and Facebook.

## Topology

The ATEM is at church; the fan-out server is at the user's home. The church
uplink is the constrained, unreliable link, which is why the server relays
(church uploads 1×) rather than the church fanning out (2×). Don't "simplify"
that away. See `docs/srt-ingest.md` for the SRT path that makes that hop
survivable.

## Tests

`backend/tests/` covers config generation, key encryption, the reload state
machine, and `/stat` parsing — the things that have actually broken. No frontend
tests yet. Run with `cd backend && python -m pytest`.

React 19's `react-hooks/set-state-in-effect` and `react-hooks/purity` rules are
set to warn in `frontend/eslint.config.mjs` because of pre-existing patterns in
`components/streaming`. Don't add new ones.
