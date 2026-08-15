# The inter-building link

## What we know

The ISP terminates in the **main building**. A cable runs from there to the
building we stream from.

- Cabled **directly** at the main building: ~50–90 Mbps up and down.
- Through the **inter-building run**: ~10 down, 30–50 up.

That comparison is good evidence, and it already localises the fault: the
inter-building segment is the problem, not the ISP and not our equipment.

## Why the asymmetry matters

**Download slower than upload is abnormal.** Consumer and business connections
are almost always asymmetric the other way. A link that delivers 30–50 up but
only 10 down is not running out of bandwidth — something is corrupting or
delaying traffic, and TCP's download path is feeling it more.

That pattern points at the physical layer, in roughly this order of likelihood:

### 1. The run is longer than 100 metres

Ethernet over copper is specified to **100 m total**, including patch cables at
both ends. Inter-building runs very often exceed it. Past that limit a link may
still come up and appear to work, while errors climb and throughput collapses —
exactly what we are seeing.

Estimate the real length, including the vertical runs and slack. If it is over
~90 m, this is almost certainly the answer and no amount of configuration will
fix it.

### 2. Duplex mismatch

One end negotiated full duplex, the other half. The classic symptom is a link
that works but is dramatically slower in one direction, with collisions and late
collisions counting up.

### 3. A damaged or marginal cable

Ethernet uses separate pairs for each direction. Damage to one pair can degrade
a single direction while the other stays healthy — which fits the asymmetry
well. Outdoor runs suffer from water ingress, rodents, UV, and crushing.

### 4. Copper between buildings at all

Running copper between two buildings is bad practice for reasons beyond speed.
The buildings have different electrical grounds, and the difference drives
current along the cable shield. That produces intermittent errors in fair
weather and destroys equipment in a storm. **Fibre is the correct medium between
buildings** precisely because it is a dielectric — no electrical path at all.

## Confirming it

### Link speed and duplex

On pfSense: **Status → Interfaces**, look at the WAN media line. Or from a shell:

```bash
ifconfig <wan-interface> | grep media
```

You want `1000baseT <full-duplex>`. If you see `100baseTX`, or `half-duplex`
anywhere, you have found it.

On a Linux box:

```bash
ethtool eth0 | grep -E "Speed|Duplex"
```

### Error counters

Errors are the giveaway. On pfSense, **Status → Interfaces** shows in/out errors
and collisions. From a shell:

```bash
netstat -i
```

Any non-zero collision count on a modern switched network means a duplex
mismatch. Steadily climbing input errors or CRC errors mean a bad cable or an
over-length run.

Check them, wait five minutes under load, and check again. What matters is
whether they are *increasing*.

### Isolate the segment

Test the inter-building link on its own, with the ISP out of the picture. Put a
laptop at each end of the run and:

```bash
iperf3 -s                      # laptop in the main building
```

```bash
iperf3 -c <main-building-laptop> -t 30      # laptop in our building
iperf3 -c <main-building-laptop> -t 30 -R   # reverse direction
```

A healthy gigabit run gives ~940 Mbps both ways with no retransmits. If this
test is slow or shows retransmits, the fault is unambiguously the cable segment
and nothing upstream.

## Fixing it

In order of how well it works:

### Fibre between the buildings — the correct fix

A pair of media converters (or small switches with SFP ports) and a run of
outdoor-rated single-mode fibre. Solves distance, immunity to interference, and
the grounding hazard in one go. Fibre is cheap; the labour of the run is the
cost.

### Point-to-point wireless — the cheap, fast fix

A pair of directional radios (Ubiquiti NanoBeam or similar, roughly $100–200 for
the pair) mounted with line of sight between the buildings. Comfortably carries
several hundred Mbps at short range, installs in an afternoon, no trenching, and
no electrical path between buildings.

For our purposes — a 6 Mbps stream — this is enormous headroom, and it is often
the most practical option when the existing run is bad and re-running cable is
not feasible.

### Re-run proper cable — only if the distance allows

If the run is genuinely under 100 m, replacing it with new outdoor-rated,
shielded Cat6 and properly terminated ends will work. Bond the shield at **one
end only** to avoid a ground loop. If it is over 100 m, this is throwing money
at a link that will stay marginal.

### Interim: force the link speed

If a duplex mismatch is confirmed and the cable cannot be replaced today, forcing
both ends to the same speed and duplex (or forcing 100full at both ends) can
stabilise a bad link at lower throughput. This is a workaround, not a fix — 100
Mbps of *reliable* link is far more useful for streaming than a gigabit link
that errors.

## What this means for the streaming plan

This takes priority over the bufferbloat work. Shaping manages a queue on a
*healthy* link; it does nothing for a link that is corrupting packets. Retransmits
caused by physical errors will also inflate the apparent bufferbloat measurement,
so **fix this first, then re-run `scripts/netdiag.sh`** — the numbers may look
entirely different afterwards.

Note also that 30–50 Mbps up is still ample for the 6 Mbps we need. If the link
were clean, the current upload figure would be fine. That is another reason to
suspect errors and latency rather than throughput as the thing killing streams.
