# Fixing bufferbloat

If `scripts/netdiag.sh` reports latency rising more than ~100 ms under load,
this is the playbook.

## What is actually happening

Somewhere upstream of you there is a buffer that is too large. When you saturate
the uplink, packets are not dropped — they are queued. The queue grows, and by
the time your packets come out the other side they are hundreds of milliseconds
late. RTMP interprets that as a dead connection and gives up.

Two consequences worth internalising:

- **More bandwidth does not fix it.** A bigger pipe with the same oversized
  buffer bloats just the same. This is why the problem survives every round of
  "we upgraded the internet."
- **The fix is to make the queue form somewhere you control**, and to manage it
  there with an algorithm that keeps it short.

## Step 1: Find your worst-case upload, not your average

Everything below depends on this number, and getting it wrong is the most common
reason shaping "doesn't work."

Your connection varies (30–50 Mbps). Shaping is only effective when your limit
is **below the real line rate at that moment**. Set it to 90% of 50 Mbps and it
does nothing whenever the line is actually at 30.

Measure several times — including a busy weekday evening and during a service:

```bash
speedtest --accept-license
```

Take the **worst** upload figure you see, not the average. Call it `U`.

## Step 2: Shape with FQ-CoDel on pfSense

FQ-CoDel keeps queues short and shares capacity fairly between flows. pfSense has
it built in.

**Firewall → Traffic Shaper → Limiters → New Limiter**

| Field | Value |
|---|---|
| Enable | checked |
| Name | `wan-up` |
| Bandwidth | **85–90% of `U`** |
| Queue Management Algorithm | **FQ-CoDel** |
| Mask | Source addresses |

Create a matching `wan-down` limiter at 85–90% of your worst *download* figure.

Then apply them. **Firewall → Rules → LAN**, edit the rule that passes your
traffic (usually the default allow rule), and under *Advanced Options → In/Out
pipe*:

- **In**: `wan-up`
- **Out**: `wan-down`

The In/Out naming is from the firewall's perspective and trips everyone up:
traffic coming *in* on the LAN interface is what leaves your network. If latency
gets worse, you have them backwards — swap them.

Deliberately shaping below your line rate is the entire point. You are choosing
to give up ~10% of throughput so the queue lives in pfSense, where FQ-CoDel keeps
it short, instead of in the building's router where nothing manages it.

## Step 3: Verify

```bash
./scripts/netdiag.sh --server <server-address> --bitrate 6000
```

The latency rise should drop sharply — often from hundreds of milliseconds to
under 30. If it does not move at all, your limiter is set above the real line
rate; lower it and try again.

## The limitation you need to know about

**Shaping only controls traffic that passes through your pfSense.**

You share the building owner's connection. If the bloat is caused by *their*
traffic — other tenants, the building's own uploads — the queue forms upstream of
your firewall, and nothing you configure can drain it. Your netdiag results will
barely improve.

You can tell which case you are in:

- Run netdiag **when the building is empty** (early morning) and again **when it
  is busy**. If it is only bad when busy, the bloat is not yours to fix.
- If it is bad even on an empty building, it is your traffic or your equipment,
  and Step 2 will fix it.

### If it is the building's traffic

Three real options, in increasing order of cost:

1. **Make the stream survive it — use SRT.** This is the one to reach for first.
   Bufferbloat manifests as latency spikes and jitter; SRT's latency window
   absorbs exactly that, where RTMP simply dies. With `latency=4000` or higher
   you can ride out a connection that RTMP cannot use at all. It does not fix the
   network, it makes the network's problems survivable — which is the practical
   goal. See [srt-ingest.md](srt-ingest.md).
2. **Ask the building owner to shape their side**, or to bridge their router so
   your pfSense terminates the connection directly and can shape everything.
   Worth asking; frequently declined.
3. **Get a dedicated connection** for the stream. A modest business line, or even
   a 5G modem as a second WAN in pfSense, used only by the encoder box. This is
   the only option that fully removes the dependency on shared infrastructure.

## Other things that cause the same symptom

Worth ruling out before blaming the building:

- **Wifi.** If the encoder box is on wifi, move it to ethernet. Wifi introduces
  its own latency and loss under load, and no amount of shaping fixes it.
- **Something else uploading.** Cloud backup, camera systems, and OS updates all
  do sustained uploads and are easy to miss. Check what else is on the network,
  and schedule backups outside service hours.
- **A duplex mismatch or failing cable.** If netdiag shows loss *at idle*, this
  is your problem — no queue is involved. Swap the cable first.
- **The encoder itself.** If `stress.sh --mode encode` fails where
  `--mode network` is clean, the network is not your constraint at all. See
  [stress-test.md](stress-test.md).

## Lowering the bitrate is a legitimate fix

If shaping is not available to you, sending less data makes filling the queue
less likely. Dropping from 6 Mbps to 4.5 Mbps is invisible to viewers and can be
the difference between a stream that holds and one that dies. Reliability beats
resolution — nobody notices the bitrate, everybody notices the outage.
