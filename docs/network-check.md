# Network check before a service

Raw speed is almost never what breaks a stream. A 1 Gbps link that drops 2% of
packets will stutter on YouTube while a clean 50 Mbps link runs flawlessly. These
checks are ordered by how likely they are to find a real problem.

**Run them from the machine that actually pushes to the platforms** — the server
running nginx-rtmp, not your laptop. Different machine, different NIC, different
cable, possibly different VLAN. SSH in first:

```bash
ssh root@<server-ip>
```

## Start here on a shared connection

If the building's network is the suspect, run the diagnostic first — it covers
everything below plus the one thing a speed test cannot show:

```bash
./scripts/netdiag.sh --server <your-server-address> --bitrate 6000
```

Run it **on the church encoder box**. See
[diagnosing a shared connection](#diagnosing-a-shared-building-connection) at the
end for what each result means.

## What the stream actually needs

| | |
|---|---|
| Video | 6 Mbps |
| Audio | ~128 kbps |
| Per destination | **~6.2 Mbps** |
| YouTube + Facebook | **~12.5 Mbps sustained upload** |
| Each HLS preview viewer | +6 Mbps |

With ~800 Mbps up you have roughly 60× headroom, so **capacity is not your risk**.
Your risks are packet loss, jitter, and anything that degrades *over time* — which
is why every test below runs for at least 60 seconds.

---

## 1. Sustained upload (not the burst number)

Speed test sites report peak throughput over a few seconds. What matters is the
floor over minutes.

```bash
curl -s https://install.speedtest.net/app/cli/install.sh | bash
speedtest --accept-license
```

Run it **three times, a minute apart**. Record the upload figure each time.

- **Good:** upload ≥ 100 Mbps and the three runs within ~20% of each other.
- **Investigate:** any run below 30 Mbps, or wide variance between runs — that
  points to congestion or a flaky link, and it will show up mid-service.

## 2. Packet loss and jitter to the actual platforms

This is the test most likely to find your problem, and the one no speed test does.

```bash
apt-get install -y mtr-tiny
mtr -r -c 100 a.rtmp.youtube.com
mtr -r -c 100 live-api-s.facebook.com
```

Read the final row (the destination), not intermediate hops — routers often
deprioritise their own ping replies and show fake loss mid-path.

- **Good:** `Loss% = 0.0`, `StDev` under 10 ms.
- **Marginal:** 0.1–1% loss. RTMP will recover but expect occasional stutter.
- **Bad:** >1% loss, or `StDev` above 30 ms. Fix this before streaming — try a
  wired connection, a different port on the switch, or your ISP.

If loss appears at the *first* hop, it's your LAN or the server's NIC. If it only
appears at the last hop, it's upstream of you.

## 3. DNS actually resolves (this one has bitten you)

nginx resolves every push hostname **when the config loads**. If DNS is down at
that moment, the whole config is rejected and *all* destinations fail together —
not just one.

```bash
systemctl status fix-dns
cat /etc/resolv.conf
getent hosts a.rtmp.youtube.com
getent hosts live-api-s.facebook.com
```

Both `getent` calls must print an IP. If either is empty, fix DNS before doing
anything else. Then confirm nginx is happy with the current config:

```bash
nginx -t
```

`syntax is ok` / `test is successful` is what you want. `host not found in url`
means DNS failed and nginx is still running whatever config it loaded last —
which may not be what the control panel thinks is live.

## 4. The real test: push to both platforms and watch for drops

Speeds and pings are proxies. This is the actual thing.

Create an **unlisted** YouTube event and a Facebook test stream, then push a
60-second synthetic feed at your real settings:

```bash
ffmpeg -re -f lavfi -i "testsrc=size=1920x1080:rate=30" \
       -f lavfi -i "sine=frequency=440" \
       -c:v libx264 -preset veryfast -b:v 6M -maxrate 6M -bufsize 12M \
       -pix_fmt yuv420p -g 60 -c:a aac -b:a 128k -t 60 \
       -f flv rtmp://<your-server>:1935/live/test
```

Watch the `speed=` figure ffmpeg prints:

- **Good:** holds at `1.0x` for the full 60 s.
- **Bad:** drops below `1.0x`, or the `drop=` counter climbs. That means frames
  aren't getting out in real time — the encoder or the uplink can't keep up.

While it runs, confirm both platform dashboards show the feed, and check the
server's own view:

```bash
curl -s http://localhost:8080/stat | grep -E "<name>|<bw_in>|<bw_out>"
```

You should see one inbound stream and outbound bandwidth roughly **2× inbound**
— that ratio *is* the fan-out working. If `bw_out` is only about equal to
`bw_in`, only one destination is actually receiving.

## 5. The ATEM → server hop

Everything above tests server → internet. If the ATEM is on the same LAN, verify
that leg too:

```bash
apt-get install -y iperf3
iperf3 -s          # on the server
```

```bash
iperf3 -c <server-ip> -t 30    # from a laptop on the ATEM's switch/VLAN
```

- **Good:** ≥ 100 Mbps, zero retransmits.
- **Bad:** retransmits climbing — usually a bad cable, a duplex mismatch, or a
  saturated uplink between switches. Swap the cable first; it's free.

> If your server lives at home and the ATEM is at church, this hop crosses the
> internet, and it becomes the *most* fragile part of the chain — worth measuring
> carefully in both directions.

## 6. Repeat under real conditions

Do a full run at the same time of day as your service, with the building's normal
wifi load present. Evening residential congestion and a room full of phones are
both real, and neither shows up in a quiet Tuesday-afternoon test.

---

## Quick pass/fail summary

| Check | Pass |
|---|---|
| Sustained upload, 3 runs | ≥ 100 Mbps, consistent |
| Loss to platforms | 0%, jitter < 10 ms |
| DNS resolves both hosts | both return an IP |
| `nginx -t` | test is successful |
| 60 s push | `speed=1.0x`, `drop=0` |
| `bw_out` vs `bw_in` | out ≈ 2× in |
| ATEM → server | ≥ 100 Mbps, no retransmits |

To rehearse any of this without touching church equipment, use
[`test-env/`](../test-env/README.md) — it runs the same fan-out end to end
against local sinks and asserts the result.


---

## Diagnosing a shared building connection

`scripts/netdiag.sh` checks, in order of how likely each is to be the problem:

1. **Connection shape** — double NAT and CGNAT. You run pfSense behind the
   building owner's router, which is double NAT by definition. It breaks NAT
   traversal (Tailscale falls back to a relay) and rules out inbound connections.
2. **Idle latency and loss** — loss with no traffic is physical: a cable, a
   switch port, or wifi. Fix that before looking anywhere else.
3. **Path to the platforms** — per-hop loss and jitter to YouTube and Facebook.
4. **MTU** — a path that can't carry 1500-byte packets mostly works and then
   stalls on sustained transfers. Common with PPPoE or stacked routers.
5. **Bufferbloat** — latency measured while the uplink is saturated at your real
   bitrate.

### Bufferbloat is the one to watch

A connection can pass every speed test and still kill a stream. The moment the
upstream queue fills, packets sit in a buffer instead of being dropped, latency
climbs into the hundreds of milliseconds, and RTMP gives up. It presents exactly
as "the internet just gave up."

Crucially, **this is not a bandwidth shortage** — buying more speed does not fix
it, which is why it survives so many rounds of troubleshooting.

| Latency rise under load | Verdict |
|---|---|
| under 30 ms | Fine |
| 30–100 ms | Usable, thin margin when the building is busy |
| over 100 ms | This is very likely your failure |

### Fixing it on pfSense

In order of effect:

1. **Enable FQ-CoDel on the WAN interface.** Firewall → Traffic Shaper →
   Limiters. Set the upload limit to about **90% of your real measured upload**
   — deliberately under, so the queue lives in pfSense where it can be managed
   rather than in the building's router where it cannot. This alone usually
   removes the problem.
2. **Prioritise the encoder box** so general building traffic yields to it.
3. **Lower the stream bitrate** until the latency rise drops below 100 ms.

### Double NAT

Being behind two routers is worth fixing regardless. Ask the building owner to
either bridge their router or put your pfSense WAN address in their DMZ. If they
use CGNAT, inbound is impossible no matter what — which is an argument for
keeping everything on Tailscale, as
[access-and-ingest.md](access-and-ingest.md) describes.
