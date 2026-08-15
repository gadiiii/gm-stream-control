# Finding your safe operating range

A set of trials to run **at church**, on the real encoder, over the real link.
The goal is a number you can trust: the bitrate that survives a two-hour service
on a bad day, not the one that works for thirty seconds on a good one.

Current situation this is meant to resolve:

- The encoder reports GPU overload, so you throttled to 4–4.5 Mbps.
- Church upload is nominally 30–50 Mbps but "varies tons".
- Measured stream sits at 4.5–6 Mbps.
- The ATEM previously refused to stream outside the local network.

Those are three different limits — encoder, uplink, and configuration — and they
need separating before any of them can be fixed.

---

## Trial 1 — Is it the encoder or the link?

This is the first question, and the GPU-overload message means you probably
already know the answer.

Run the ladder twice **from the encoder box**:

```bash
./test-env/stress.sh --mode encode  --ingest rtmp://<home-server>:1935/live --key live
```

```bash
./test-env/stress.sh --mode network --ingest rtmp://<home-server>:1935/live --key live
```

`--mode encode` compresses in real time, like OBS does. `--mode network`
pre-renders each clip and streams it with `-c copy`, so **no encoding happens
during the measured run** — anything short of realtime is the link alone.

| encode | network | Meaning |
|---|---|---|
| fails at 5 Mbps | clean at 9 Mbps | **Encoder bound.** Trial 2. |
| fails at 5 Mbps | fails at 5 Mbps | **Link bound.** Trial 3. |
| clean throughout | clean throughout | Neither is your limit — Trial 4. |

## Trial 2 — Fix the encoder (if it's encoder bound)

"GPU overloaded" in OBS almost always means one of these:

1. **x264 running on the CPU while you assume the GPU is doing it.** In OBS,
   Settings → Output → Encoder. If it says *x264*, switch to a hardware encoder:
   NVIDIA NVENC, AMD AMF, Intel QuickSync, or Apple VideoToolbox. This alone
   usually removes the ceiling.
2. **x264 preset too slow.** If you must stay on x264, use `veryfast` — the
   default for streaming for good reason. `medium` or `slow` will overload a
   modest CPU at 1080p30.
3. **Downscaling in OBS.** If Base and Output resolutions differ, OBS rescales
   every frame. Match them, or let the ATEM output the target resolution.

Confirm the fix by re-running with the hardware encoder:

```bash
./test-env/stress.sh --mode encode --encoder h264_nvenc \
    --ingest rtmp://<home-server>:1935/live --key live
```

(`h264_videotoolbox` on a Mac, `h264_qsv` on Intel, `h264_amf` on AMD.)

The important thing this settles: **if the encoder was the limit, your 4–4.5
Mbps throttle was working around the wrong problem** and you may have plenty of
uplink to spare.

## Trial 3 — Map the link's real ceiling

If the network is the limit, find where it actually is:

```bash
./test-env/stress.sh --mode network --duration 120 \
    --rungs "3000 4000 4500 5000 6000 7000" \
    --ingest rtmp://<home-server>:1935/live --key live
```

Use `--duration 120`. Short rungs miss the thing you care about — a link that
holds for 20 seconds and sags at 90 is exactly the link that fails mid-service.

Run this **three times: a quiet weekday, a busy weekday evening, and during a
service**. "Varies tons" means one measurement is not an answer. Your safe
setting is the worst result, not the average.

## Trial 4 — The whole chain, both platforms, full duration

Everything above tests one leg. This tests the real thing.

```bash
python backend/scripts/audit_stream_keys.py     # keys decrypt cleanly
```

Then in the control panel, hit the **pre-flight check** on each destination. It
now asks YouTube and Facebook to actually accept the stored key, so an expired
key shows up here instead of at 10:30 on Sunday.

Then run a full-length rehearsal at your chosen bitrate:

```bash
./test-env/stress.sh --mode encode --rungs "<your number>" --duration 900 \
    --ingest rtmp://<home-server>:1935/live --key live
```

While it runs, on the home server:

```bash
watch -n 5 'curl -s http://localhost:8080/stat | grep -E "<bw_in>|<bw_out>"'
```

**`bw_out` should stay at roughly 2× `bw_in`.** That ratio is the fan-out
working. If it sags toward 1×, one platform is being dropped.

## Trial 5 — Can the ATEM reach the server directly?

Worth retesting under the new network config. If it works, you can drop the
bridge box and possibly OBS from the chain.

On the ATEM (ATEM Software Control → Output → Streaming), set a custom RTMP
server:

```
Server:     rtmp://<home-server-public-address>:1935/live
Stream Key: atem-test
```

Then on the home server, confirm it arrived:

```bash
curl -s http://localhost:8080/stat | grep -A3 "atem-test"
```

If it doesn't leave the building, the usual causes are outbound 1935 blocked by
the church firewall, or the ATEM having no route/DNS for an external host. Try
the server's raw IP rather than a hostname to separate DNS from routing.

> **Before you delete OBS from the chain**, know what you'd lose. The ATEM has
> no auto-reconnect and no dynamic bitrate — if the church uplink dips, it just
> stops. OBS recovers. Given that "the church internet just gives up" is your
> documented failure mode, keep OBS until the SRT path below is in place.

---

## Reading the results

| Symptom | Cause | Fix |
|---|---|---|
| `speed` < 1.0, `drop` = 0, network mode clean | encoder CPU/GPU bound | hardware encoder, faster preset |
| `drop` > 0 | frames couldn't be sent in time | lower bitrate, or SRT |
| Clean at 45s, fails at 120s | buffer filling gradually | you are at the edge — drop a rung |
| Fails at every rung including 1500 | not bandwidth | check `mtr` loss, cabling, wifi |
| `bw_out` ≈ `bw_in` during fan-out | only one destination receiving | check the config and the pre-flight |

## Choosing the number

Take the highest rung that is clean at **120 seconds, on your worst measurement
day**, then go one rung down. If that lands at 4.5 Mbps, that is a perfectly good
1080p30 stream — within YouTube's recommended range — and it will be far more
reliable than 6 Mbps that occasionally collapses.

Reliability beats bitrate. Nobody notices 4.5 vs 6 Mbps. Everybody notices the
stream dropping mid-sermon.

Once the [SRT path](srt-ingest.md) is in place, re-run Trial 3. SRT rides out
the dips that force a conservative RTMP setting, so your safe bitrate should go
up.
