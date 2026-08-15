# SRT ingest — surviving a bad church uplink

## Why

The church→home hop is the fragile part of your chain, and RTMP is the wrong
protocol for it. RTMP runs over plain TCP with no loss recovery tuned for live
media: a brief dip and the connection drops, which is exactly the "stream lagging
or cutting off, church internet giving up" failure you have been living with.

**SRT is the open standard that fixes this**, and it is what Resi's proprietary
protocol is doing conceptually. It buffers and retransmits lost packets inside a
configurable latency window, so a lossy moment costs you a couple of seconds of
delay instead of the stream. It's free, it's mature, OBS speaks it natively, and
there is nothing to reverse-engineer.

The trade is latency: a 2-second SRT window means the stream is 2 seconds further
behind. For a church service where nobody is interacting live, that costs you
nothing.

```
BEFORE  OBS --rtmp--> home nginx-rtmp --push--> YouTube + Facebook
                 ^ no loss recovery; a dip kills the stream

AFTER   OBS --srt---> MediaMTX --rtmp(localhost)--> nginx-rtmp --push--> platforms
                 ^ retransmits lost packets; rides out the dips
```

MediaMTX only moves packets — no re-encoding, no quality change, no extra CPU of
consequence. nginx-rtmp keeps doing the fan-out exactly as it does today, and the
control panel is unchanged.

## Install on the home server

```bash
curl -fsSL https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_linux_amd64.tar.gz | tar -xz -C /tmp
install -m 755 /tmp/mediamtx /usr/local/bin/mediamtx
```

```bash
install -m 644 /opt/gm-stream-control/deploy/gm-srt.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now gm-srt
systemctl status gm-srt
```

**ffmpeg must be on the host** — MediaMTX shells out to it to forward the stream
into nginx-rtmp. `deploy/setup.sh` already installs it; confirm with
`ffmpeg -version`. Without it the SRT stream arrives and goes nowhere, and the
log repeats `runOnAvailable command exited: "ffmpeg": executable file not found`.

Open **UDP 8890** to the internet (SRT is UDP — a TCP-only port forward will
silently fail):

```bash
ufw allow 8890/udp
```

## Configure OBS at church

Settings → Stream → Service: **Custom**

```
Server:     srt://<home-server-address>:8890?streamid=publish:live&latency=2000
Stream Key: (leave empty)
```

`latency=2000` is the recovery window in milliseconds. Tune it to the link:

| Round-trip time (`ping <home-server>` from church) | latency |
|---|---|
| under 20 ms | 800 |
| 20–50 ms | 2000 |
| 50–100 ms | 4000 |
| unstable / high loss | 6000–8000 |

Rule of thumb: **at least 4× your RTT**, more if `mtr` shows loss. Bigger window
survives worse links at the cost of delay. Start at 2000 and raise it if you
still see drops.

Also turn on, in Settings → Advanced → Network:
- **Dynamically change bitrate to manage congestion** — lowers bitrate instead of
  dropping the stream when the uplink sags. Do this regardless of SRT.

## Verify it

With OBS streaming, on the home server:

```bash
curl -s http://127.0.0.1:9997/v3/paths/list | python3 -m json.tool
```

You should see the `live` path with `ready: true` and a rising `bytesReceived`.
Then confirm it reached nginx-rtmp and fanned out:

```bash
curl -s http://localhost:8080/stat | grep -E "<name>|<bw_in>|<bw_out>"
```

`bw_out ≈ 2 × bw_in` means both platforms are receiving.

## Watch for loss being recovered

This is the number that tells you SRT is earning its place:

```bash
curl -s http://127.0.0.1:9997/v3/srtconns/list | python3 -m json.tool | grep -iE "retrans|lost|drop"
```

Retransmitted packets climbing while the stream stays healthy is exactly the
point: those are the packets that would have killed an RTMP stream.

If `packetsDropped` is climbing too, the latency window is too small for the
link — raise it.

## Rolling back

Nothing about RTMP ingest is removed. Point OBS back at
`rtmp://<home-server>:1935/live` and everything works as before. Run both in
parallel for a service or two before committing.

## After it's in place

Re-run [Trial 3](stress-test.md) — SRT should let you raise the bitrate you can
safely sustain, because you are no longer setting it low purely to avoid dips.
