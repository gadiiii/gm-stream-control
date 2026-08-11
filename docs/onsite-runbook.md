# On-site runbook

For a visit to the church with limited time. Everything here needs to be done
*there*, on the encoder box and the church network — everything else has already
been done from home.

**Bring:** a laptop that can SSH to the server, and the Tailscale login.

If you only have 15 minutes, do steps 1, 2 and 6. They are the ones that either
find the problem or prove the stream works.

---

## 0. Before you leave home

These make the visit short. All of them work remotely.

- [ ] PR merged and the server running merged `main`
- [ ] Pre-flight green on both YouTube and Facebook
- [ ] SRT installed and running on the server (`systemctl status gm-srt`)
- [ ] Panel reachable over Tailscale from a non-server machine
- [ ] `./scripts/netdiag.sh --quick` run **from home** — gives you a healthy
      baseline to compare the church numbers against

---

## 1. Is Tailscale direct or relayed? — 2 minutes

Everything else assumes the church box can reach the server efficiently.

```bash
tailscale ping <server-name>
```

- `via 100.x.y.z:41641` → **direct.** Move on.
- `via DERP(xxx)` → **relayed.** Your video is routing through Tailscale's
  infrastructure. Fix before trusting it with a service:
  - pfSense: allow outbound **UDP 41641**
  - pfSense: Firewall → NAT → Outbound → Hybrid, add a rule for the encoder box
    with **Static Port** enabled (default port rewriting breaks hole punching)
  - Re-run after each change.

## 1b. Check the inter-building cable — 5 minutes

Cabling directly at the main building gave ~50–90 up and down; through the
inter-building run it is ~10 down, 30–50 up. Download slower than upload is
abnormal and points at a physical fault, so check this **before** interpreting
anything else — errors on this segment will distort every other measurement.

On pfSense, **Status → Interfaces**:

- Media should read `1000baseT <full-duplex>`. `100baseTX` or `half-duplex` is
  the fault.
- Note in/out errors and collisions, wait five minutes under load, note them
  again. Anything *increasing* means a bad or over-length cable.

Full detail and the fix options: [interbuilding-link.md](interbuilding-link.md).

## 2. Diagnose the building connection — 5 minutes

The main event. Run it on the encoder box:

```bash
./scripts/netdiag.sh --server <server-tailscale-address> --bitrate 6000
```

Write down the **latency rise under load**. That single number is the most
likely explanation for streams that die mid-service:

| Rise | Meaning |
|---|---|
| under 30 ms | Connection is fine |
| 30–100 ms | Thin margin — expect trouble on a busy morning |
| over 100 ms | **This is your problem.** Bufferbloat, not bandwidth. |

If it is over 100 ms, go to step 3. Otherwise skip to step 4.

## 3. Fix bufferbloat on pfSense — 10 minutes

Only if step 2 said so. Full playbook, including what to do when the bloat is
the building's traffic rather than yours: [bufferbloat.md](bufferbloat.md).

1. Note your **real measured upload** from the netdiag output.
2. Firewall → Traffic Shaper → Limiters → new limiter, **FQ-CoDel**, bandwidth
   set to **90% of that measured upload**.
3. Apply it to the WAN interface, outbound direction.
4. Re-run step 2. The rise should drop sharply.

Setting the limit *below* your real speed is the point — it keeps the queue
inside pfSense, where it can be managed, rather than in the building owner's
router, where you have no control.

While you are in pfSense: add a rule prioritising the encoder box so general
building traffic yields to the stream.

## 4. Find the real bitrate ceiling — 10 minutes

Two runs. The comparison is what matters — it separates an encoder limit from a
network limit, which is the open question behind your GPU-overload messages.

```bash
./scripts/stress.sh --mode encode  --ingest rtmp://<server>:1935/live --key live
```

```bash
./scripts/stress.sh --mode network --ingest rtmp://<server>:1935/live --key live
```

(These live in `test-env/stress.sh`.)

| encode | network | Meaning |
|---|---|---|
| fails early | clean higher | **Encoder bound.** Switch OBS to a hardware encoder (NVENC / QuickSync / AMF) and re-test — your 4–4.5 Mbps throttle may be unnecessary. |
| fails early | fails early | **Link bound.** The bitrate ceiling is real; set below it. |
| both clean | both clean | Neither is your limit. |

Take the highest clean rung, then **go one rung down** for headroom.

## 5. Test the ATEM directly — 5 minutes

Worth retesting under the current network config.

ATEM Software Control → Output → Streaming, custom RTMP:

```
Server:     rtmp://<server-tailscale-address>:1935/live
Stream Key: atem-test
```

On the server:

```bash
curl -s http://localhost:8080/stat | grep -A3 atem-test
```

If it does not appear, try the raw `100.x` address rather than a name — that
separates DNS from routing. Note the ATEM cannot join a tailnet itself, so it
needs a route to it; if that is not in place, this test will fail for reasons
that have nothing to do with the ATEM.

> **Do not remove OBS from the chain even if this works.** The ATEM has no
> auto-reconnect and no dynamic bitrate; it simply stops when the uplink dips.
> OBS recovers. Given that the church connection giving up is your documented
> failure, keep OBS until SRT has proven itself over a few services.

## 6. Full rehearsal — 10 minutes

The one that actually proves it.

- [ ] OBS → Settings → Advanced → Network → **Dynamically change bitrate to
      manage congestion** enabled
- [ ] Auto-reconnect enabled, 5–10 s retry
- [ ] Bitrate set to the number from step 4
- [ ] Unlisted YouTube event and a Facebook test stream created
- [ ] Pre-flight green on both in the panel

Start OBS. Then on the server:

```bash
watch -n 5 'curl -s http://localhost:8080/stat | grep -E "<bw_in>|<bw_out>"'
```

**`bw_out` should hold at roughly 2× `bw_in`** for the full ten minutes. That
ratio is the fan-out working. If it sags toward 1×, one platform is dropping.

Confirm both platform dashboards show the feed, then stop.

## 7. If time allows: switch OBS to SRT — 5 minutes

Only if SRT is already running on the server.

**Settings → Stream → Custom**

```
Server:     srt://<server-tailscale-address>:8890?streamid=publish:live&latency=2000
Stream Key: (empty)
```

Repeat step 6. If anything misbehaves, put the RTMP URL back — nothing was
removed, and both ingests run side by side.

Raise `latency` if drops persist: at least 4× the RTT you measured in step 1.

---

## Take home

Write these down before you leave:

- Tailscale: direct or relayed
- Latency rise under load, before (and after) any pfSense change
- Highest clean rung in encode mode, and in network mode
- Whether the ATEM reached the server directly
- Whether `bw_out` held at 2× for the full rehearsal

Those five answers determine everything that happens next.
