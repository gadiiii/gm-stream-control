# GM Stream Control Panel

Takes one RTMP feed from OBS and fans it out to several platforms at once
(YouTube and Facebook today), with a web dashboard for going live, watching
stream health, and managing destinations.

## How it works

OBS publishes to nginx-rtmp on port 1935. nginx-rtmp relays that single input to
every enabled destination using a `push` directive per platform, and serves an
HLS copy for the dashboard's live preview. The FastAPI backend owns the nginx
config: every destination change regenerates `nginx.conf` and reloads nginx.

```
OBS ──rtmp://server/live──> nginx-rtmp ──push──> YouTube
                                 │      ──push──> Facebook
                                 ├──> HLS  (dashboard preview)
                                 └──> /stat (polled every 5s for status)
```

## Running locally

```bash
docker compose -f docker-compose.rtmp.yml up -d
```

```bash
cd backend && cp .env.example .env && pip install -r requirements.txt && uvicorn main:app --reload
```

```bash
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

The dashboard is at http://localhost:3000. `docs/stream-test.md` walks through
an end-to-end test with OBS.

## Tests

```bash
cd backend && python -m pytest
```

For end-to-end multi-platform verification — one feed proven to reach both
destinations, with no church equipment involved — see
[test-env/README.md](test-env/README.md).

## Operating docs

| | |
|---|---|
| `scripts/stream-check.sh` | One-command ingest-path test from the encoder box — run before setting up OBS |
| [friday-field-checklist.md](docs/friday-field-checklist.md) | Step-by-step to walk the cable path and pinpoint where it degrades |
| [onsite-runbook.md](docs/onsite-runbook.md) | Ordered checklist for a visit to the church, when time is short |
| [access-and-ingest.md](docs/access-and-ingest.md) | Reaching the panel and publishing to it over Tailscale, with nothing exposed publicly |
| [interbuilding-link.md](docs/interbuilding-link.md) | The cable run between buildings — the suspected root fault |
| [bufferbloat.md](docs/bufferbloat.md) | Fixing the failure mode where more bandwidth never helped |
| [network-check.md](docs/network-check.md) | Pre-service checks, the way a stream actually stresses the link |
| [stress-test.md](docs/stress-test.md) | Trials to find your safe bitrate, and to separate encoder limits from uplink limits |
| [srt-ingest.md](docs/srt-ingest.md) | SRT instead of RTMP for the church→server hop, so a bad uplink stops killing the stream |
| [stream-test.md](docs/stream-test.md) | Manual OBS/ATEM walkthrough |

## Deployment

`deploy/setup.sh` provisions an Ubuntu host: nginx-rtmp, a Python venv, a
production frontend build, and systemd units for both services. See
[CLAUDE.md](CLAUDE.md) for the constraints that are easy to trip over.
