# Friday field checklist

Goal for the day: **find the exact point where the connection degrades**, prove
it with numbers, and leave with either a fix or a clear ask for the building
owner.

Everything here is on equipment you own or administer. Nothing touches the
building owner's devices.

---

## Before you leave home

- [ ] Laptop with `iperf3`, `ethtool` (Linux) and this repo checked out
- [ ] A second laptop or a phone that can run `iperf3 -s` (you need one at each
      end of the inter-building run)
- [ ] A known-good ethernet cable in your bag — the cheapest possible test is
      swapping the cable and watching the numbers change
- [ ] `iperf3` running on the home server, reachable over Tailscale, so you have
      a fixed target: `iperf3 -s`
- [ ] Note the server's Tailscale IP: `tailscale ip -4`

Install the tools if missing:

```bash
# Linux laptop
sudo apt-get install -y iperf3 ethtool
# Mac
brew install iperf3
```

---

## Part A — Baseline at the source (main building)

Start where the connection is known good, so every later reading has something
to compare against.

- [ ] **A1.** Plug directly into the ISP hand-off / main-building switch.
- [ ] **A2.** Run the probe, labelled clearly:

  ```bash
  ./scripts/linkprobe.sh main-building-source
  ```

- [ ] **A3.** Speed test from here — this is your true line rate, before the
      inter-building run touches it:

  ```bash
  speedtest --accept-license
  ```

  Write down up and down. This is the number everything else is measured against.

**Expect:** gigabit full duplex, no idle loss, ~50–90 up/down. If it's already
bad *here*, the problem is upstream of you (the ISP or the building's own gear)
and no cabling work on your side will help — skip to Part D and talk to them.

---

## Part B — Walk the run (the main event)

You're hunting the segment where gigabit becomes 100 Mb, or where errors and
loss appear. Work from the source outward, testing at **every** patch panel,
switch, coupler, and wall jack along the path.

At each point:

- [ ] **B1.** Plug in.
- [ ] **B2.** Probe it with a descriptive label and point iperf3 at your server:

  ```bash
  ./scripts/linkprobe.sh <where-you-are> --iperf <server-tailscale-ip>
  ```

  Good labels matter — you're comparing points later. Use names like
  `mainbldg-patch-panel`, `outside-junction`, `ourbldg-entry`, `booth-jack`.

- [ ] **B3.** Read the three things the probe highlights:
  - **Link speed / duplex** — the moment this drops from 1000 to 100, or shows
    half duplex, *the segment you just plugged past is the fault.*
  - **Idle loss** — any loss with no traffic is physical damage.
  - **iperf3 throughput** — where ~940 becomes a few hundred or less, you've
    crossed the bad segment.

- [ ] **B4.** Note where you are and move to the next point.

**The tell:** two adjacent points where one is clean gigabit and the next is
100 Mb / lossy / slow. The bad cable, coupler, or jack is *between those two
points*. That's your answer.

### Isolating the inter-building run by itself

The single most convincing test — takes the ISP entirely out of the picture:

- [ ] **B5.** Put a laptop at the **main-building end** of the run:

  ```bash
  iperf3 -s
  ```

- [ ] **B6.** From the **our-building end**, test straight across the run:

  ```bash
  ./scripts/linkprobe.sh across-the-run --iperf <main-building-laptop-ip>
  ```

  This measures only the cable between the buildings. A clean gigabit run gives
  ~940 Mb/s both directions with zero retransmits. Anything much less, with the
  ISP removed from the path, **convicts the run itself** — hard evidence to bring
  to the building owner.

---

## Part C — Quick physical checks while you're there

Cheap, fast, and each rules something out:

- [ ] **C1. Swap the cable.** If a segment tests bad, swap in your known-good
      cable and re-probe. If the numbers jump, the cable *was* the fault — done.
- [ ] **C2. Estimate the run length.** Pace it or check the cable print. Over
      ~90 m of copper (including the vertical runs and slack) is past spec and
      explains a link that comes up but underperforms.
- [ ] **C3. Look at the terminations.** Field-crimped RJ45 ends on an outdoor run
      are a common failure. A visibly rough or reseated end is worth re-crimping
      or swapping.
- [ ] **C4. Note the cable type.** Indoor Cat5e/Cat6 used outdoors degrades from
      water and UV. If it's not outdoor-rated and it's exposed, that's a finding.
- [ ] **C5. Force the speed (only if a duplex mismatch is confirmed).** As a
      *diagnostic*, forcing both ends to 100full can stabilise a marginal link.
      A reliable 100 Mb beats an erroring gigabit for a 6 Mb stream. This is a
      test, not a fix.

---

## Part D — Interpret, and decide the mitigation

Lay the `link-report.txt` points side by side. The story is usually obvious:
clean until point X, degraded after.

| What the walk showed | What it means | Do this |
|---|---|---|
| Bad at the source (Part A) | Not your cabling — ISP or building gear | Ask the owner (below); no on-site fix |
| Clean until a specific segment | That cable/coupler/jack is the fault | Swap it if short; otherwise Part E |
| Only the inter-building run is bad | The run between buildings is the problem | Part E |
| Errors rise only under load | Marginal cable near its limit | Replace that segment |
| Half duplex somewhere | Duplex mismatch | Force both ends the same, or replace |

### What you can mitigate on your own side, today

Even before the cable is fixed, these make the stream survive a degraded link:

- [ ] **Lower the bitrate.** Drop OBS to 4–4.5 Mbps. Invisible to viewers, far
      more tolerant of a bad link. Do this Friday regardless.
- [ ] **OBS Dynamic Bitrate + auto-reconnect** on (Settings → Advanced →
      Network). Lets the stream sag and recover instead of dying.
- [ ] **Switch to SRT** once it's running on the server. It rides out the jitter
      and loss that kill RTMP — the closest thing to a software fix for a bad
      link. `latency=4000` or higher over a rough run. See
      [srt-ingest.md](srt-ingest.md).
- [ ] **FQ-CoDel shaping on pfSense**, only if the link is *healthy but bloated*
      rather than physically broken. See [bufferbloat.md](bufferbloat.md).

### The real fixes for the run (bring numbers to the owner)

Ordered by value for a 6 Mbps stream:

1. **Point-to-point wireless** between the buildings — a pair of directional
   radios (~$100–200), line of sight, installs in an afternoon, no trenching, no
   electrical path between buildings. Usually the best value.
2. **Fibre** — the correct medium between buildings; solves distance,
   interference, and the grounding hazard at once. More labour to run.
3. **Re-run outdoor-rated Cat6** — only if the distance is genuinely under 100 m.

### The ask for the building owner

You share their connection, so this is a conversation, not a config change. Bring
the `across-the-run` iperf3 number — "a direct connection does 900 Mb/s, the run
between our buildings does N" is what gets action. Ask them to:

- check the switch port on *their* end (speed/duplex, error counts), and
- allow a fibre or wireless link between the buildings.

---

## Take home — write these five down

1. Line rate at the source (Part A speed test)
2. The point where the walk first degraded (Part B)
3. The inter-building run's own iperf3 numbers, both directions (B6)
4. Whether swapping the cable changed anything (C1)
5. Rough length of the run (C2)

Those five answers decide the fix. Bring them back and we'll pick the mitigation.
