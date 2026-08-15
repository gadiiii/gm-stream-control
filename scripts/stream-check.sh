#!/bin/bash
# Test the ingest path from wherever you are to the fan-out server.
#
#   ./scripts/stream-check.sh 100.94.211.0
#   ./scripts/stream-check.sh 100.94.211.0 --bitrate 6000 --seconds 120
#
# Pushes a synthetic feed at your real settings and reports whether the path
# held it in real time. This proves the NETWORK PATH — not OBS, not the
# platforms. If this cannot hold 1.0x, no OBS tweak will help; the link is the
# problem. Run it before setting up OBS at the booth.
#
# While it runs, on the SERVER:
#   watch -n 5 'curl -s http://localhost:8080/stat | grep -E "<name>|<bw_in>|<bw_out>"'
# You want bw_out at roughly 2x bw_in — that is both platforms receiving.
set -uo pipefail

SERVER="${1:-}"
shift 2>/dev/null || true

BITRATE=4500
SECONDS_LEN=60
KEY="test"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --bitrate) BITRATE="$2"; shift 2 ;;
        --seconds) SECONDS_LEN="$2"; shift 2 ;;
        --key)     KEY="$2"; shift 2 ;;
        -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'

if [[ -z "$SERVER" ]]; then
    echo "usage: $0 <server-ip-or-name> [--bitrate 4500] [--seconds 60]" >&2
    exit 2
fi
# Strip a pasted http:// or rtmp:// and any trailing path — we only want host[:port].
SERVER=${SERVER#http://}; SERVER=${SERVER#https://}; SERVER=${SERVER#rtmp://}
SERVER=${SERVER%%/*}
case "$SERVER" in
    *:*) HOSTPORT="$SERVER" ;;
    *)   HOSTPORT="${SERVER}:1935" ;;
esac
HOST=${HOSTPORT%:*}; PORT=${HOSTPORT##*:}

command -v ffmpeg >/dev/null || { echo "ffmpeg not found. brew install ffmpeg / apt-get install ffmpeg" >&2; exit 1; }

# ── 1. Is the ingest port even reachable? ────────────────────────────────────
printf '\n%s1. Reachability%s  %s%s%s\n' "$BOLD" "$RESET" "$DIM" "$HOST:$PORT" "$RESET"
if command -v nc >/dev/null && nc -z -w4 "$HOST" "$PORT" 2>/dev/null; then
    printf '  %sGOOD%s  TCP %s is open\n' "$GREEN" "$RESET" "$PORT"
else
    printf '  %sBAD%s   Cannot open TCP %s on %s\n' "$RED" "$RESET" "$PORT" "$HOST"
    printf '        %sCheck Tailscale (tailscale ping %s) and that nginx is up on the server.%s\n' "$DIM" "$HOST" "$RESET"
    exit 1
fi

# ── 2. Push a synthetic feed and read the result ─────────────────────────────
printf '\n%s2. Pushing %s kbps for %ss%s  %s-> rtmp://%s/live/%s%s\n' \
    "$BOLD" "$BITRATE" "$SECONDS_LEN" "$RESET" "$DIM" "$HOSTPORT" "$KEY" "$RESET"
printf '   %sWatch speed= below. It must hold near 1.0x. Ctrl-C to stop early.%s\n\n' "$DIM" "$RESET"

LOG=$(mktemp)
ffmpeg -hide_banner -loglevel error -stats \
    -re -f lavfi -i "testsrc=size=1920x1080:rate=30" \
    -f lavfi -i "sine=frequency=440:sample_rate=44100" \
    -c:v libx264 -preset veryfast -tune zerolatency -b:v "${BITRATE}k" \
    -maxrate "${BITRATE}k" -bufsize "$((BITRATE * 2))k" \
    -pix_fmt yuv420p -g 60 -keyint_min 60 -r 30 \
    -c:a aac -b:a 128k -ar 44100 \
    -t "$SECONDS_LEN" -f flv "rtmp://${HOSTPORT}/live/${KEY}" 2>&1 | tee "$LOG"

# ── 3. Verdict ────────────────────────────────────────────────────────────────
LAST=$(tr '\r' '\n' < "$LOG" | grep -E "frame=" | tail -1)
SPEED=$(echo "$LAST" | grep -oE "speed=[ ]*[0-9.]+x" | grep -oE "[0-9.]+" | tail -1)
DROP=$(echo "$LAST" | grep -oE "drop=[ ]*[0-9]+" | grep -oE "[0-9]+" | tail -1)
rm -f "$LOG"
SPEED=${SPEED:-0}; DROP=${DROP:-0}

printf '\n%s3. Verdict%s\n' "$BOLD" "$RESET"
if awk "BEGIN{exit !($SPEED >= 0.99)}" && [[ "$DROP" -eq 0 ]]; then
    printf '  %sGOOD%s  Held %sx with no dropped frames — the path carries this bitrate.\n' "$GREEN" "$RESET" "$SPEED"
    printf '        %sNext: run the full OBS rehearsal, and confirm bw_out ~ 2x bw_in on the server.%s\n' "$DIM" "$RESET"
elif [[ "$DROP" -gt 0 ]]; then
    printf '  %sBAD%s   %s frames dropped — the path could not carry %s kbps in real time.\n' "$RED" "$RESET" "$DROP" "$BITRATE"
    printf '        %sLower the bitrate (--bitrate 4000) and retry. If even 3000 drops, the link is the problem.%s\n' "$DIM" "$RESET"
else
    printf '  %sBAD%s   Ran at %sx, below realtime — the encoder or the uplink cannot keep up.\n' "$RED" "$RESET" "$SPEED"
    printf '        %sTry --bitrate 4000. If it persists at low bitrates, fix the cable before streaming.%s\n' "$DIM" "$RESET"
fi
printf '\n'
