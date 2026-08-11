#!/bin/bash
# Bitrate ladder: find where the path actually breaks.
#
#   ./test-env/stress.sh                                   # local sinks, 3-9 Mbps
#   ./test-env/stress.sh --ingest rtmp://home-server:1935/live --key live
#   ./test-env/stress.sh --rungs "4000 4500 5000 6000"     # custom ladder
#   ./test-env/stress.sh --duration 120                    # longer rungs
#   ./test-env/stress.sh --encoder h264_videotoolbox       # hardware encode
#   ./test-env/stress.sh --mode network                    # isolate the link from the encoder
#
# Each rung publishes a constant-bitrate feed for --duration seconds and reports
# frames dropped and the encoder's realtime factor. Your safe operating range is
# the highest rung that finishes with 0 drops and speed >= 0.99x — then take one
# rung below that for headroom, because a service is not a quiet test.
#
# Run it from the machine that will really be encoding, over the link that will
# really be used. Running it on a laptop next to the router proves nothing about
# a church uplink.
set -uo pipefail

INGEST="rtmp://localhost:1935/live"
KEY="stress"
RUNGS="3000 4000 4500 5000 6000 7000 9000"
DURATION=45
ENCODER="libx264"
MODE="encode"      # encode = encoder + uplink together; network = uplink only
RESOLUTION="1920x1080"
FPS=30

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ingest)     INGEST="$2"; shift 2 ;;
        --key)        KEY="$2"; shift 2 ;;
        --rungs)      RUNGS="$2"; shift 2 ;;
        --duration)   DURATION="$2"; shift 2 ;;
        --encoder)    ENCODER="$2"; shift 2 ;;
        --mode)       MODE="$2"; shift 2 ;;
        --resolution) RESOLUTION="$2"; shift 2 ;;
        --fps)        FPS="$2"; shift 2 ;;
        -h|--help)    sed -n '2,17p' "$0"; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }

RESULTS=$(mktemp)
trap 'rm -f "$RESULTS"' EXIT

echo "Target      : ${INGEST}/${KEY}"
echo "Encoder     : ${ENCODER}   ${RESOLUTION} @ ${FPS}fps"
echo "Mode        : ${MODE}$([ "$MODE" = network ] && echo '  (pre-rendered; measures the link alone)' || echo '   (live encode; measures encoder + link)')"
echo "Rungs       : ${RUNGS} kbps, ${DURATION}s each"
echo
printf "%-10s %-10s %-10s %-10s %s\n" "BITRATE" "SPEED" "DROPPED" "FPS" "VERDICT"
printf "%-10s %-10s %-10s %-10s %s\n" "-------" "-----" "-------" "---" "-------"

for KBPS in $RUNGS; do
    LOG=$(mktemp)

    if [[ "$MODE" == "network" ]]; then
        # Pre-render, then stream with -c:v copy. No encoding happens during the
        # measured run, so anything short of realtime is the network — not CPU.
        CLIP=$(mktemp -u).flv
        ffmpeg -hide_banner -loglevel error \
            -f lavfi -i "testsrc=size=${RESOLUTION}:rate=${FPS}" \
            -f lavfi -i "sine=frequency=440:sample_rate=44100" \
            -c:v "$ENCODER" -b:v "${KBPS}k" -maxrate "${KBPS}k" -bufsize "$((KBPS * 2))k" \
            -pix_fmt yuv420p -g $((FPS * 2)) -keyint_min $((FPS * 2)) -r "$FPS" \
            -c:a aac -b:a 128k -ar 44100 -t "$DURATION" -y "$CLIP" 2>/dev/null

        ffmpeg -hide_banner -loglevel error -stats \
            -re -i "$CLIP" -c copy -f flv "${INGEST}/${KEY}" 2>"$LOG"
        EXIT=$?
        rm -f "$CLIP"
    else
        # Encode live, exactly as the real encoder does. Measures the encoder
        # and the uplink together — which is what actually has to hold up.
        ffmpeg -hide_banner -loglevel error -stats \
            -re -f lavfi -i "testsrc=size=${RESOLUTION}:rate=${FPS}" \
            -re -f lavfi -i "sine=frequency=440:sample_rate=44100" \
            -c:v "$ENCODER" -b:v "${KBPS}k" -maxrate "${KBPS}k" -bufsize "$((KBPS * 2))k" \
            -pix_fmt yuv420p -g $((FPS * 2)) -keyint_min $((FPS * 2)) -r "$FPS" \
            -c:a aac -b:a 128k -ar 44100 \
            -t "$DURATION" -f flv "${INGEST}/${KEY}" 2>"$LOG"
        EXIT=$?
    fi
    # ffmpeg rewrites its stats line with \r; take the final state.
    LAST=$(tr '\r' '\n' < "$LOG" | grep -E "frame=" | tail -1)
    SPEED=$(echo "$LAST" | grep -oE "speed=[ ]*[0-9.]+x" | grep -oE "[0-9.]+" | tail -1)
    DROPPED=$(echo "$LAST" | grep -oE "drop=[ ]*[0-9]+" | grep -oE "[0-9]+" | tail -1)
    FPS_OUT=$(echo "$LAST" | grep -oE "fps=[ ]*[0-9.]+" | grep -oE "[0-9.]+" | tail -1)
    SPEED=${SPEED:-0}
    DROPPED=${DROPPED:-0}
    FPS_OUT=${FPS_OUT:-0}

    if [[ $EXIT -ne 0 ]]; then
        VERDICT="FAILED — $(grep -m1 -iE 'error|failed|refused|broken' "$LOG" | cut -c1-60)"
    elif [[ "$DROPPED" -gt 0 ]]; then
        VERDICT="DROPPED FRAMES"
    elif awk "BEGIN{exit !($SPEED < 0.99)}"; then
        if [[ "$MODE" == "network" ]]; then
            VERDICT="TOO SLOW — the uplink can't carry this bitrate"
        else
            VERDICT="TOO SLOW — encoder CPU/GPU bound (re-run --mode network to confirm)"
        fi
    else
        VERDICT="ok"
    fi

    printf "%-10s %-10s %-10s %-10s %s\n" "${KBPS}k" "${SPEED}x" "$DROPPED" "$FPS_OUT" "$VERDICT"
    echo "${KBPS} ${VERDICT}" >> "$RESULTS"
    rm -f "$LOG"
    sleep 3   # let the server settle between rungs
done

echo
HIGHEST=$(grep " ok$" "$RESULTS" | tail -1 | cut -d' ' -f1)
if [[ -z "$HIGHEST" ]]; then
    echo "No rung passed cleanly. Start lower (--rungs \"1500 2000 2500\"), and if even"
    echo "those fail the problem is the encoder or the link, not the bitrate."
    exit 1
fi

SAFE=$(grep " ok$" "$RESULTS" | tail -2 | head -1 | cut -d' ' -f1)
echo "Highest clean rung : ${HIGHEST} kbps"
echo "Suggested setting  : ${SAFE:-$HIGHEST} kbps  (one rung down, for headroom)"
echo
echo "A service is noisier than this test — other traffic, a full building, a long run."
echo "Do not operate at the highest clean rung."
