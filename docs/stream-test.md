# Local Stream Test

This gives you a real RTMP ingest target on your machine:

```bash
docker compose -f docker-compose.rtmp.yml up -d
```

Run the backend:

```bash
cd backend
source venv/bin/activate
RTMP_STAT_URL=http://localhost:8080/stat python -m uvicorn main:app --reload
```

Run the frontend:

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:3000/streaming
```

## OBS Settings

Use a custom RTMP service:

```text
Server: rtmp://localhost:1935/live
Stream Key: test
```

Start streaming. Within about 5 seconds, the dashboard should flip to live and show uptime/bitrate from Nginx-RTMP.

## ATEM Mini Pro ISO Settings

Use:

```text
RTMP URL: rtmp://<your-computer-ip>:1935/live
Stream Key: test
```

If the ATEM is on another device, replace `<your-computer-ip>` with the LAN IP of the machine running Docker.

## Sanity Checks

Nginx-RTMP stat XML:

```bash
curl http://localhost:8080/stat
```

Backend status:

```bash
curl http://localhost:8000/api/stream/status
```

HLS playlist, useful for later preview work:

```text
http://localhost:8080/hls/test.m3u8
```

Stop the local RTMP server:

```bash
docker compose -f docker-compose.rtmp.yml down
```
