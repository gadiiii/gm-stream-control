#!/bin/bash
# Start nginx-rtmp, then the backend, the same order production uses.
set -e

# Always reseed, so a restart is a clean slate. The backend regenerates this
# from the database moments later anyway, and keeping a previously-written file
# means a bad config can wedge the container across restarts.
cp /app/deploy/nginx.conf /etc/nginx/nginx.conf

# The seed config points its hooks at 127.0.0.1:8000, which is correct here
# because the backend shares this container.
mkdir -p /tmp/hls

echo "==> starting nginx"
nginx -t
nginx

echo "==> starting backend"
# --workers 1 is required, not a default. latest_status, active_stream_id and
# nginx_reload_pending are module globals in main.py; a second worker gets its
# own copy and the deferred-reload logic silently stops working.
exec python3 -m uvicorn main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 1
