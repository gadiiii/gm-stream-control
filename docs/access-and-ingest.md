# Panel access and stream ingest

Both the control panel and the RTMP ingest run over Tailscale. Nothing is
exposed to the public internet — no port forwards, no open 1935, and the
Cloudflare Tunnel becomes optional.

This works because the two machines that matter are already on the tailnet: the
home server, and the church encoder box running OBS.

```
church booth machine ─┐
                      ├── Tailscale ── home server ── push ──> YouTube + Facebook
church OBS/encoder  ──┘                (panel :3000, ingest :1935)
```

## 1. Panel access

The panel is operated from the shared booth machine, so put that machine on the
tailnet and reach the server by its Tailscale name. No public exposure, no
password beyond the Supabase login already in place.

On the server, get its address:

```bash
tailscale ip -4          # 100.x.y.z
tailscale status --self  # shows the MagicDNS hostname
```

With MagicDNS on (Tailscale admin → DNS → enable MagicDNS), the booth machine
opens:

```
http://gm-stream-control:3000
```

Plain HTTP is fine here. Tailscale encrypts every packet with WireGuard, so the
traffic is protected at the network layer — the browser's "Not secure" label
refers to TLS, which adds nothing on top of an already-encrypted tunnel.

### Two settings that must match

The frontend calls the backend **from the browser**, so the API address has to
be one the booth machine can reach — not `localhost`.

`frontend/.env.local` on the server:

```
NEXT_PUBLIC_API_URL=http://gm-stream-control:8000
NEXT_PUBLIC_WS_URL=ws://gm-stream-control:8000
```

`NEXT_PUBLIC_*` values are baked in at build time, so this needs a rebuild —
editing the file and restarting is not enough:

```bash
cd /opt/gm-stream-control/frontend && npm run build && systemctl restart gm-frontend
```

`backend/.env` must allow that origin for CORS:

```
FRONTEND_ORIGIN=http://gm-stream-control:3000,http://localhost:3000
```

```bash
systemctl restart gm-backend
```

### If you want real HTTPS

Tailscale can issue a genuine certificate without exposing anything:

```bash
tailscale serve --bg --https=443 3000
tailscale serve --bg --https=8443 8000
```

Then the panel is at `https://gm-stream-control.<tailnet>.ts.net` and the API at
`https://gm-stream-control.<tailnet>.ts.net:8443` — update the two
`NEXT_PUBLIC_*` values (use `wss://` for the WebSocket) and rebuild. Worth doing
only if the "Not secure" label bothers volunteers; it buys no real security over
the tunnel.

### Retiring the Cloudflare Tunnel

Once the booth machine uses Tailscale, the public hostname is no longer needed.
Leaving it up means keeping the `CF_TUNNEL_SECRET` and `PUBLIC_API_HOST` machinery
and a public attack surface for no benefit. Keep it only if someone genuinely
needs the panel from a device that can't run Tailscale.

## 2. Stream ingest

OBS on the church encoder box publishes straight to the server over Tailscale.

**Settings → Stream → Service: Custom**

```
Server:     rtmp://gm-stream-control:1935/live
Stream Key: live
```

The stream key can be anything — nginx's `on_publish` hook always accepts, so the
key is only a label in `/stat` and the stream history. Use `live` unless you have
a reason not to.

Also turn on, in **Settings → Advanced → Network**:

- **Dynamically change bitrate to manage congestion** — drops bitrate instead of
  dropping the stream when the uplink sags. This is the single most useful OBS
  setting for a variable church connection.
- **Automatic reconnect**, 5–10 second retry.

### Verify it end to end

On the server, while OBS is streaming:

```bash
curl -s http://localhost:8080/stat | grep -E "<name>|<bw_in>|<bw_out>"
```

You want your stream key listed, and **`bw_out` roughly 2× `bw_in`**. That ratio
is the fan-out working — if `bw_out` is about equal to `bw_in`, only one platform
is receiving.

## 3. Confirm Tailscale is direct, not relayed

**Do this before Sunday.** Tailscale prefers a direct peer-to-peer connection but
falls back to a DERP relay when NAT traversal fails. A relayed connection routes
your video through Tailscale's infrastructure — added latency, and a throughput
ceiling that a 6 Mbps stream will notice.

From the church encoder box:

```bash
tailscale ping gm-stream-control
```

- `pong ... via 100.x.y.z:41641` — **direct.** Good.
- `pong ... via DERP(xxx)` — **relayed.** Fix it before relying on it.

### Fixing a relayed connection on pfSense

Two settings account for most cases:

1. **Allow outbound UDP 41641** (and general outbound UDP) from the encoder box.
   Tailscale needs it for hole punching.
2. **Outbound NAT → Static Port** for the encoder box. pfSense rewrites source
   ports by default, which breaks NAT traversal. Firewall → NAT → Outbound,
   switch to Hybrid, and add a rule for that host with *Static Port* enabled.

Re-run `tailscale ping` after each change. Also worth enabling **UPnP/NAT-PMP**
on the segment if the building's upstream allows it.

### While you're in pfSense

Add a traffic-shaping rule prioritizing the encoder box's outbound traffic. The
church connection is shared, and a stream competing with general building traffic
is a large part of why it "gives up."

## 4. Later: SRT instead of RTMP

Same Tailscale path, better resilience — see [srt-ingest.md](srt-ingest.md).
The OBS setting becomes:

```
Server:     srt://gm-stream-control:8890?streamid=publish:live&latency=2000
Stream Key: (empty)
```

Note SRT is **UDP** 8890. Over Tailscale no forwarding is needed, but a relayed
connection hurts UDP more than TCP — check `tailscale ping` first.
