#!/bin/bash
# Capture the health of one network connection point. Run it at each jack.
#
#   ./scripts/linkprobe.sh main-building-jack
#   ./scripts/linkprobe.sh our-side-of-run --iperf 100.90.1.5
#   ./scripts/linkprobe.sh booth --iperf 100.90.1.5 --target 8.8.8.8
#
# The first argument is a label for where you are plugged in — it goes in the
# log so you can compare points afterwards. Everything is appended to
# link-report.txt in the repo root, so a whole walk ends up in one file.
#
# What it captures, and why each matters:
#   * link speed / duplex  — 100Mb or half-duplex on a gigabit run is a fault
#   * interface errors      — rising errors = bad cable or an over-length run
#   * latency + loss        — loss at idle is physical, not congestion
#   * iperf3 throughput     — the real speed of the segment, ISP out of the picture
#
# It only reads. It changes nothing on any network.
set -uo pipefail

LABEL="${1:-unlabelled}"
shift 2>/dev/null || true

IPERF_TARGET=""
PING_TARGET="1.1.1.1"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --iperf)  IPERF_TARGET="$2"; shift 2 ;;
        --target) PING_TARGET="$2"; shift 2 ;;
        -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

REPORT="$(cd "$(dirname "$0")/.." && pwd)/link-report.txt"
BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'

# Everything printed also gets appended (without colour) to the report.
emit() { printf '%s\n' "$1"; printf '%s\n' "$(printf '%s' "$1" | sed 's/\x1b\[[0-9;]*m//g')" >> "$REPORT"; }

emit ""
emit "${BOLD}========================================================${RESET}"
emit "${BOLD}  POINT: ${LABEL}${RESET}"
emit "  $(date '+%Y-%m-%d %H:%M:%S')  host: $(hostname)"
emit "${BOLD}========================================================${RESET}"

# ── Which interface is actually carrying traffic? ────────────────────────────
OS=$(uname -s)
if [[ "$OS" == "Darwin" ]]; then
    IFACE=$(route get "$PING_TARGET" 2>/dev/null | awk '/interface:/{print $2}')
else
    IFACE=$(ip route get "$PING_TARGET" 2>/dev/null | grep -oE 'dev [^ ]+' | awk '{print $2}')
fi
IFACE=${IFACE:-eth0}
emit "  active interface: ${IFACE}"

# ── Link speed and duplex ─────────────────────────────────────────────────────
emit ""
emit "${BOLD}Link negotiation${RESET}"
SPEED=""; DUPLEX=""
if [[ "$OS" == "Darwin" ]]; then
    MEDIA=$(ifconfig "$IFACE" 2>/dev/null | grep -i media)
    emit "  ${DIM}${MEDIA:-(no media line — likely Wi-Fi or a USB adapter)}${RESET}"
    echo "$MEDIA" | grep -qi "1000baseT" && SPEED=1000
    echo "$MEDIA" | grep -qi "100baseTX" && SPEED=100
    echo "$MEDIA" | grep -qi "half-duplex" && DUPLEX=half
elif command -v ethtool >/dev/null; then
    ETH=$(ethtool "$IFACE" 2>/dev/null)
    SPEED=$(echo "$ETH" | awk -F': ' '/Speed:/{gsub(/[^0-9]/,"",$2); print $2}')
    DUPLEX=$(echo "$ETH" | awk -F': ' '/Duplex:/{print tolower($2)}')
    emit "  speed: ${SPEED:-?} Mb/s   duplex: ${DUPLEX:-?}"
else
    emit "  ${YELLOW}ethtool not installed — apt-get install ethtool${RESET}"
fi

if [[ "$DUPLEX" == "half" ]]; then
    emit "  ${RED}HALF DUPLEX — this is a fault. Expect severe one-directional slowness.${RESET}"
elif [[ -n "$SPEED" && "$SPEED" -lt 1000 ]]; then
    emit "  ${YELLOW}Negotiated ${SPEED} Mb/s, not gigabit. On a run that should be gigabit,${RESET}"
    emit "  ${YELLOW}this points at cable length, a damaged pair, or a bad termination.${RESET}"
elif [[ "$SPEED" == "1000" ]]; then
    emit "  ${GREEN}Gigabit, full duplex.${RESET}"
fi

# ── Error counters ────────────────────────────────────────────────────────────
emit ""
emit "${BOLD}Interface errors${RESET}  ${DIM}(note these, then re-run under load — rising = bad cable)${RESET}"
if [[ "$OS" == "Darwin" ]]; then
    emit "  $(netstat -I "$IFACE" -b 2>/dev/null | awk 'NR==1||NR==2{print "  "$0}')"
elif command -v ip >/dev/null; then
    ip -s -s link show "$IFACE" 2>/dev/null | grep -A2 -iE "RX:|TX:" | while IFS= read -r line; do emit "  $line"; done
fi

# ── Latency and loss ──────────────────────────────────────────────────────────
emit ""
emit "${BOLD}Latency and loss to ${PING_TARGET}${RESET}"
PSTAT=$(ping -c 30 -i 0.2 "$PING_TARGET" 2>/dev/null | tail -2)
emit "  $(echo "$PSTAT" | head -1)"
emit "  $(echo "$PSTAT" | tail -1)"
LOSS=$(echo "$PSTAT" | grep -oE '[0-9.]+% packet loss' | grep -oE '^[0-9.]+')
if [[ -n "$LOSS" ]] && awk "BEGIN{exit !($LOSS > 0)}"; then
    emit "  ${RED}Loss at idle (${LOSS}%). No traffic is running, so this is physical —${RESET}"
    emit "  ${RED}a cable, a port, or an over-length run. Not congestion.${RESET}"
else
    emit "  ${GREEN}No loss at idle.${RESET}"
fi

# ── Throughput across the segment ─────────────────────────────────────────────
if [[ -n "$IPERF_TARGET" ]]; then
    emit ""
    emit "${BOLD}Throughput to ${IPERF_TARGET} (iperf3)${RESET}"
    if command -v iperf3 >/dev/null; then
        UP=$(iperf3 -c "$IPERF_TARGET" -t 10 2>/dev/null | awk '/sender/{print $7, $8}')
        DN=$(iperf3 -c "$IPERF_TARGET" -t 10 -R 2>/dev/null | awk '/receiver/{print $7, $8}')
        emit "  upload  : ${UP:-FAILED — is 'iperf3 -s' running on the other end?}"
        emit "  download: ${DN:-FAILED}"
        emit "  ${DIM}A clean gigabit segment gives ~940 Mbit/s each way with no retransmits.${RESET}"
        emit "  ${DIM}Slow here, with the ISP out of the path, convicts the cable segment.${RESET}"
    else
        emit "  ${YELLOW}iperf3 not installed — brew install iperf3 / apt-get install iperf3${RESET}"
    fi
fi

emit ""
emit "${DIM}  appended to ${REPORT}${RESET}"
emit ""
