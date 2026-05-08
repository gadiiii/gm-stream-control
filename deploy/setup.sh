#!/bin/bash
# GM Stream Control — LXC setup script
# Run as root on a fresh Ubuntu 22.04 LXC
# Usage: curl -s https://raw.githubusercontent.com/.../setup.sh | bash
# Or: bash setup.sh

set -e

echo "=== GM Stream Control — Server Setup ==="

# ── System deps ──────────────────────────────────────────────────────────────
apt-get update -qq
apt-get install -y -qq \
    git curl wget build-essential \
    python3 python3-pip python3-venv \
    nginx-full libnginx-mod-rtmp \
    nodejs npm \
    supervisor \
    ffmpeg

# Node 20 via NodeSource (Ubuntu 22.04 ships Node 12)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# PM2 for frontend
npm install -g pm2

# Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

echo "=== Cloning repo ==="
cd /opt
git clone https://github.com/gadiiii/gm-stream-control.git gm-stream-control || \
    (cd gm-stream-control && git pull)
cd gm-stream-control

# ── Backend ───────────────────────────────────────────────────────────────────
echo "=== Setting up backend ==="
cd /opt/gm-stream-control/backend
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt

# Copy env if not already present
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "⚠️  Edit /opt/gm-stream-control/backend/.env before starting!"
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "=== Building frontend ==="
cd /opt/gm-stream-control/frontend

if [ ! -f .env.local ]; then
    cp .env.local.example .env.local 2>/dev/null || cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
EOF
    echo "⚠️  Edit /opt/gm-stream-control/frontend/.env.local before starting!"
fi

npm install -q
npm run build

# ── Nginx-RTMP ────────────────────────────────────────────────────────────────
echo "=== Configuring Nginx-RTMP ==="
cp /opt/gm-stream-control/deploy/nginx.conf /etc/nginx/nginx.conf
nginx -t && systemctl restart nginx

# ── Systemd services ──────────────────────────────────────────────────────────
echo "=== Installing systemd services ==="
cp /opt/gm-stream-control/deploy/gm-backend.service /etc/systemd/system/
cp /opt/gm-stream-control/deploy/gm-frontend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable gm-backend gm-frontend
systemctl start gm-backend gm-frontend

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit /opt/gm-stream-control/backend/.env  (Supabase keys)"
echo "  2. Edit /opt/gm-stream-control/frontend/.env.local  (Supabase keys)"
echo "  3. sudo tailscale up  (then visit the URL it gives you to authenticate)"
echo "  4. systemctl restart gm-backend gm-frontend"
echo ""
echo "RTMP ingest:  rtmp://<this-server-ip>:1935/live"
echo "Control panel: http://<tailscale-ip>:3000"
echo "API docs:      http://<tailscale-ip>:8000/docs"
