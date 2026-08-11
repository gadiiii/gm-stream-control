#!/bin/bash
# The ATEM stand-in: a synthetic 1080p30 feed at the real service bitrate.
#
#   ./test-env/stream.sh                  # test pattern + tone + burned-in timecode
#   ./test-env/stream.sh --file svc.mp4   # loop a real recording instead
#   ./test-env/stream.sh --duration 60    # stop after 60s (default: run until Ctrl-C)
#
# Encoder settings match what the church actually streams (6 Mbps, 1080p30,
# 2s keyframes) so the bitstream the origin sees is representative. What this
# does NOT reproduce is the ATEM hardware itself — its capture path and its own
# reconnect behavior are out of scope.
set -euo pipefail

INGEST="${INGEST:-rtmp://localhost:1935/live}"
KEY="${KEY:-test}"
SOURCE_FILE=""
DURATION=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --file)     SOURCE_FILE="$2"; shift 2 ;;
        --duration) DURATION="$2"; shift 2 ;;
        --ingest)   INGEST="$2"; shift 2 ;;
        --key)      KEY="$2"; shift 2 ;;
        -h|--help)  sed -n '2,12p' "$0"; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

if ! command -v ffmpeg >/dev/null; then
    echo "ffmpeg not found. brew install ffmpeg" >&2
    exit 1
fi

# macOS ships bash 3.2, where expanding an empty array under `set -u` is an
# error. The `[@]+` guard expands to nothing at all when the array is unset.
DURATION_ARGS=()
[[ -n "$DURATION" ]] && DURATION_ARGS=(-t "$DURATION")

# 6 Mbps CBR-ish, 2s keyframe interval (60 frames @ 30fps) — platforms want a
# keyframe every 2s or they buffer badly.
ENCODE_ARGS=(
    -c:v libx264 -preset veryfast -tune zerolatency -profile:v high
    -b:v 6M -maxrate 6M -bufsize 12M
    -pix_fmt yuv420p -g 60 -keyint_min 60 -r 30
    -c:a aac -b:a 128k -ar 44100
    -f flv
)

echo "==> publishing to ${INGEST}/${KEY}"

if [[ -n "$SOURCE_FILE" ]]; then
    [[ -f "$SOURCE_FILE" ]] || { echo "no such file: $SOURCE_FILE" >&2; exit 1; }
    echo "==> source: ${SOURCE_FILE} (looping)"
    exec ffmpeg -hide_banner -loglevel warning -stats \
        -re -stream_loop -1 -i "$SOURCE_FILE" \
        ${DURATION_ARGS[@]+"${DURATION_ARGS[@]}"} "${ENCODE_ARGS[@]}" "${INGEST}/${KEY}"
fi

echo "==> source: synthetic test pattern with running timestamp"
# `testsrc` draws its own frame counter and elapsed timestamp into the picture,
# which is what makes latency visible — compare it against the wall clock in a
# player pulling from a sink or from the HLS preview. It renders that text
# itself, so this works on ffmpeg builds without libfreetype (no drawtext).
exec ffmpeg -hide_banner -loglevel warning -stats \
    -re -f lavfi -i "testsrc=size=1920x1080:rate=30" \
    -re -f lavfi -i "sine=frequency=440:sample_rate=44100" \
    ${DURATION_ARGS[@]+"${DURATION_ARGS[@]}"} "${ENCODE_ARGS[@]}" "${INGEST}/${KEY}"
