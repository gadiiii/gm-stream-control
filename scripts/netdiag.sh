#!/bin/bash
# Diagnose a shared/building internet connection for live streaming.
#
#   ./scripts/netdiag.sh                          # full run, ~4 minutes
#   ./scripts/netdiag.sh --server 100.x.y.z       # load-test against your server
#   ./scripts/netdiag.sh --bitrate 6000           # match your real stream
#   ./scripts/netdiag.sh --quick                  # skip the load test
#
# Run this ON THE CHURCH ENCODER BOX, over the connection you actually stream on.
#
# The headline test is bufferbloat: latency measured while the uplink is
# saturated. A connection can pass every speed test and still collapse under a
# sustained stream, because the moment the upstream queue fills, latency spikes
# and RTMP gives up. On a shared building connection this is the single most
# likely cause of "the internet just gave up" — and no speed-test site shows it.
set -uo pipefail

SERVER=""
BITRATE=6000
QUICK=0
PING_TARGET="1.1.1.1"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --server)  SERVER="$2"; shift 2 ;;
        --bitrate) BITRATE="$2"; shift 2 ;;
        --target)  PING_TARGET="$2"; shift 2 ;;
        --quick)   QUICK=1; shift ;;
        -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'

section() { printf '\n%s%s%s\n%s\n' "$BOLD" "$1" "$RESET" "$(printf '%.0s-' $(seq 1 ${#1}))"; }
good()    { printf '  %sGOOD%s  %s\n' "$GREEN" "$RESET" "$1"; }
bad()     { printf '  %sBAD%s   %s\n' "$RED" "$RESET" "$1"; }
warn()    { printf '  %sWARN%s  %s\n' "$YELLOW" "$RESET" "$1"; }
note()    { printf '        %s%s%s\n' "$DIM" "$1" "$RESET"; }

avg_rtt() {
    # $1 = host, $2 = count. Prints average RTT in ms, or empty on failure.
    ping -c "$2" -i 0.3 "$1" 2>/dev/null \
        | tail -1 \
        | awk -F'/' '/avg|=/ {print $5}' \
        | cut -d. -f1
}

loss_pct() {
    ping -c "$2" -i 0.3 "$1" 2>/dev/null \
        | grep -oE '[0-9.]+% packet loss' \
        | grep -oE '^[0-9.]+'
}

# ── 1. Where are we on the internet? ─────────────────────────────────────────
section "1. Connection shape"

GATEWAY=$(netstat -rn 2>/dev/null | awk '/^default|^0\.0\.0\.0/ {print $2; exit}')
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
PUBLIC_IP=$(curl -s --max-time 8 https://api.ipify.org 2>/dev/null)

note "local address : ${LOCAL_IP:-unknown}"
note "gateway       : ${GATEWAY:-unknown}"
note "public address: ${PUBLIC_IP:-unknown}"

# Count private hops on the way out — more than one means double NAT.
PRIVATE_HOPS=$(traceroute -n -m 6 -w 1 -q 1 "$PING_TARGET" 2>/dev/null \
    | awk '{print $2}' \
    | grep -cE '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' || true)

if [[ "${PRIVATE_HOPS:-0}" -gt 1 ]]; then
    warn "Double NAT — ${PRIVATE_HOPS} private hops before reaching the internet"
    note "You are behind pfSense behind the building's router. This breaks NAT"
    note "traversal (Tailscale falls back to a relay) and complicates inbound"
    note "anything. Ask the building owner to bridge, or to put your pfSense WAN"
    note "in their DMZ."
else
    good "Single layer of NAT"
fi

# CGNAT: the building's ISP hands out 100.64.0.0/10 — no inbound, ever.
case "$PUBLIC_IP" in
    100.6[4-9].*|100.[7-9][0-9].*|100.1[0-1][0-9].*|100.12[0-7].*)
        warn "Public address is inside CGNAT range (100.64/10)"
        note "The ISP is sharing one address across customers. Inbound connections"
        note "are impossible and NAT traversal usually fails. Tailscale will relay."
        ;;
esac

# ── 2. Idle latency and loss ─────────────────────────────────────────────────
section "2. Idle latency and loss"

IDLE_RTT=$(avg_rtt "$PING_TARGET" 20)
IDLE_LOSS=$(loss_pct "$PING_TARGET" 20)

if [[ -z "$IDLE_RTT" ]]; then
    bad "Could not reach ${PING_TARGET} at all"
else
    note "idle RTT to ${PING_TARGET}: ${IDLE_RTT} ms, loss ${IDLE_LOSS:-?}%"
    if [[ "$IDLE_RTT" -lt 40 ]]; then good "Idle latency ${IDLE_RTT} ms"
    elif [[ "$IDLE_RTT" -lt 80 ]]; then warn "Idle latency ${IDLE_RTT} ms — higher than ideal"
    else bad "Idle latency ${IDLE_RTT} ms — something is wrong before any load"
    fi

    if [[ -n "$IDLE_LOSS" ]] && awk "BEGIN{exit !($IDLE_LOSS > 0)}"; then
        bad "Packet loss at idle: ${IDLE_LOSS}%"
        note "Loss with no traffic means a physical or wireless problem — bad cable,"
        note "a failing switch port, or wifi. Fix this before anything else."
    fi
fi

# ── 3. Path to the platforms ─────────────────────────────────────────────────
section "3. Path to the streaming platforms"

for HOST in a.rtmp.youtube.com live-api-s.facebook.com; do
    if ! getent hosts "$HOST" >/dev/null 2>&1 && ! host "$HOST" >/dev/null 2>&1; then
        bad "$HOST does not resolve — DNS problem"
        continue
    fi
    RTT=$(avg_rtt "$HOST" 15)
    LOSS=$(loss_pct "$HOST" 15)
    if [[ -z "$RTT" ]]; then
        warn "$HOST does not answer ping (often blocked, not necessarily broken)"
    elif [[ -n "$LOSS" ]] && awk "BEGIN{exit !($LOSS > 1)}"; then
        bad "$HOST — ${LOSS}% loss, ${RTT} ms"
    else
        good "$HOST — ${RTT} ms, ${LOSS:-0}% loss"
    fi
done

# ── 4. MTU ───────────────────────────────────────────────────────────────────
section "4. MTU"

# Try 1472 bytes payload = 1500 MTU. Don't-fragment flag differs by platform.
if ping -c1 -D -s 1472 "$PING_TARGET" >/dev/null 2>&1 || \
   ping -c1 -M do -s 1472 "$PING_TARGET" >/dev/null 2>&1; then
    good "Full 1500-byte MTU works"
else
    warn "1500-byte packets do not get through"
    note "Something in the path uses a smaller MTU (PPPoE, a VPN, double NAT)."
    note "Symptom is traffic that mostly works but stalls on large transfers."
    note "On pfSense set the WAN MTU to match, commonly 1492."
fi

# ── 5. Bufferbloat — the important one ───────────────────────────────────────
if [[ "$QUICK" -eq 1 ]]; then
    section "5. Latency under load — SKIPPED (--quick)"
    exit 0
fi

section "5. Latency under load (bufferbloat)"

if [[ -z "$SERVER" ]]; then
    warn "No --server given, so the upload load test is skipped"
    note "Re-run with --server <your-server-address> to measure the thing that"
    note "most likely explains a stream that dies mid-service."
    exit 0
fi

if ! command -v ffmpeg >/dev/null; then
    warn "ffmpeg not installed — cannot generate upload load"
    exit 0
fi

# Accept "host" or "host:port"; RTMP defaults to 1935.
case "$SERVER" in
    *:*) SERVER_HOSTPORT="$SERVER" ;;
    *)   SERVER_HOSTPORT="${SERVER}:1935" ;;
esac
SERVER_HOST=${SERVER_HOSTPORT%:*}
SERVER_PORT=${SERVER_HOSTPORT##*:}

note "Saturating the uplink at ${BITRATE} kbps for 30s and watching latency…"

FFLOG=$(mktemp)
STARTED=$(date +%s)

ffmpeg -hide_banner -loglevel error \
    -re -f lavfi -i "testsrc=size=1280x720:rate=30" \
    -f lavfi -i "sine=frequency=440" \
    -c:v libx264 -preset ultrafast -b:v "${BITRATE}k" -maxrate "${BITRATE}k" \
    -bufsize "$((BITRATE * 2))k" -pix_fmt yuv420p -g 60 \
    -c:a aac -b:a 128k -t 30 \
    -f flv "rtmp://${SERVER_HOSTPORT}/live/netdiag" >"$FFLOG" 2>&1 &
FFMPEG_PID=$!

sleep 4
LOADED_RTT=$(avg_rtt "$PING_TARGET" 40)
LOADED_LOSS=$(loss_pct "$PING_TARGET" 40)

wait $FFMPEG_PID 2>/dev/null
FFMPEG_EXIT=$?
ELAPSED=$(( $(date +%s) - STARTED ))

# If the publish failed there was never any load, and a "latency did not move"
# verdict would be actively misleading — it would read as a healthy connection.
if [[ $FFMPEG_EXIT -ne 0 || $ELAPSED -lt 20 ]]; then
    bad "The load test never ran — could not publish to ${SERVER_HOSTPORT}"
    note "$(head -3 "$FFLOG" | tr '\n' ' ' | cut -c1-150)"
    note ""
    note "Latency was measured with no traffic, so it proves nothing. Check that"
    note "the server is reachable from here — 'nc -vz ${SERVER_HOST} ${SERVER_PORT}' — and that"
    note "nginx is running, then re-run."
    rm -f "$FFLOG"
    exit 1
fi
rm -f "$FFLOG"

if [[ -z "$LOADED_RTT" || -z "${IDLE_RTT:-}" ]]; then
    warn "Could not measure loaded latency"
    exit 0
fi

INCREASE=$((LOADED_RTT - IDLE_RTT))
[[ $INCREASE -lt 0 ]] && INCREASE=0   # noise; treat as no rise
note "idle ${IDLE_RTT} ms  ->  under load ${LOADED_RTT} ms  (+${INCREASE} ms), loss ${LOADED_LOSS:-0}%"

if [[ "$INCREASE" -lt 30 ]]; then
    good "Latency barely moves under load — the connection handles the stream well"
elif [[ "$INCREASE" -lt 100 ]]; then
    warn "Latency rises ${INCREASE} ms under load — mild bufferbloat"
    note "Usable, but the margin is thin when the building is busy."
else
    bad "Latency rises ${INCREASE} ms under load — severe bufferbloat"
    note ""
    note "This is very likely why the stream cuts out. When the uplink fills, the"
    note "queue ahead of you grows until packets are delayed past the point RTMP"
    note "tolerates. It is not a bandwidth shortage — adding speed will not fix it."
    note ""
    note "Fix, in order of effect:"
    note "  1. pfSense: Firewall > Traffic Shaper > enable FQ-CoDel on WAN, with"
    note "     the upload limit set to ~90% of your real measured upload."
    note "  2. Lower the stream bitrate until the increase drops below 100 ms."
    note "  3. Prioritise the encoder box in the shaper so building traffic yields."
fi

if [[ -n "$LOADED_LOSS" ]] && awk "BEGIN{exit !($LOADED_LOSS > 1)}"; then
    bad "Packet loss under load: ${LOADED_LOSS}% — the uplink is genuinely saturated"
    note "Either the stream bitrate exceeds what this connection can carry, or"
    note "something else in the building is using it at the same time."
fi

printf '\n%sDone.%s Re-run during a service for the numbers that actually matter.\n\n' "$BOLD" "$RESET"
