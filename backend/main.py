import asyncio
import os
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from collections import deque
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs
from typing import Any
from uuid import UUID

import httpx
import jwt as pyjwt
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from supabase import create_client

load_dotenv()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
YOUTUBE_CHANNEL_ID = os.getenv("YOUTUBE_CHANNEL_ID", "")
FACEBOOK_ACCESS_TOKEN = os.getenv("FACEBOOK_ACCESS_TOKEN", "")
FACEBOOK_PAGE_ID = os.getenv("FACEBOOK_PAGE_ID", "")
RTMP_STAT_URL = os.getenv("RTMP_STAT_URL", "http://localhost:8080/stat")
NGINX_CONFIG_PATH = os.getenv("NGINX_CONFIG_PATH", "")
CF_TUNNEL_SECRET = os.getenv("CF_TUNNEL_SECRET", "")
COMPANION_API_KEY = os.getenv("COMPANION_API_KEY", "")
COMPANION_URL = os.getenv("COMPANION_URL", "")
COMPANION_BUTTON_GOLIVE = os.getenv("COMPANION_BUTTON_GOLIVE", "")
COMPANION_BUTTON_STOP = os.getenv("COMPANION_BUTTON_STOP", "")
_frontend_origins_raw = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
FRONTEND_ORIGINS: list[str] = [o.strip() for o in _frontend_origins_raw.split(",") if o.strip()]
if "http://localhost:3000" not in FRONTEND_ORIGINS:
    FRONTEND_ORIGINS.append("http://localhost:3000")

THUMBNAIL_PATH = Path(tempfile.gettempdir()) / "gm_stream_thumbnail.jpg"

supabase: Any | None = (
    create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None
)

app = FastAPI(title="GM Stream Control Panel API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_TUNNEL_EXEMPT = {"/api/stream/on_publish", "/api/stream/on_done", "/api/stream/ws"}

@app.middleware("http")
async def verify_tunnel_secret(request: Request, call_next):
    path = request.url.path
    exempt = path in _TUNNEL_EXEMPT or path.startswith("/api/companion/")
    if CF_TUNNEL_SECRET and not exempt:
        if request.headers.get("X-Tunnel-Secret") != CF_TUNNEL_SECRET:
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    return await call_next(request)


class StreamStatus(BaseModel):
    live: bool = False
    uptime_secs: int = 0
    bitrate_kbps: int = 0
    total_viewers: int = 0
    stream_name: str | None = None
    updated_at: str | None = None


class DestinationCreate(BaseModel):
    name: str
    rtmp_url: str
    stream_key: str
    enabled: bool = True
    platform_type: str


class DestinationPatch(BaseModel):
    name: str | None = None
    rtmp_url: str | None = None
    stream_key: str | None = None
    enabled: bool | None = None
    platform_type: str | None = None


class StreamStartRequest(BaseModel):
    title: str | None = None


class TeamInviteRequest(BaseModel):
    user_id: str | None = None
    email: str | None = None
    role: str = Field(default="viewer")
    invited_by: str | None = None


class TeamRolePatch(BaseModel):
    role: str


class CompanionAction(BaseModel):
    action: str
    destination_id: str | None = None
    title: str | None = None


POLL_FAILURES_BEFORE_OFFLINE = 3

latest_status = StreamStatus()
active_stream_id: str | None = None
active_stream_title: str | None = None
peak_viewers = 0
connected_websockets: set[WebSocket] = set()
bitrate_history: deque[dict[str, Any]] = deque(maxlen=360)


def get_supabase() -> Any:
    if supabase is None:
        raise HTTPException(
            status_code=503,
            detail="Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY.",
        )
    return supabase


def get_fernet() -> Fernet:
    if not ENCRYPTION_KEY:
        raise HTTPException(status_code=503, detail="ENCRYPTION_KEY is not configured.")
    return Fernet(ENCRYPTION_KEY.encode())


def get_current_user(request: Request) -> dict[str, Any]:
    """Validate Supabase JWT by calling the Supabase auth API."""
    if supabase is None:
        return {}
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = auth.removeprefix("Bearer ").strip()
    try:
        response = supabase.auth.get_user(token)
        if not response.user:
            raise HTTPException(status_code=401, detail="Invalid token.")
        return {"sub": response.user.id, "email": response.user.email}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token.") from exc


def require_companion_key(request: Request) -> None:
    if not COMPANION_API_KEY:
        raise HTTPException(status_code=503, detail="COMPANION_API_KEY is not configured.")
    provided = request.headers.get("X-Companion-Key") or request.query_params.get("key")
    if provided != COMPANION_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid Companion API key.")


async def trigger_companion_button(button: str) -> None:
    """Press a Bitfocus Companion button, e.g. "1/0/2" (page/row/column)."""
    if not COMPANION_URL or not button:
        return
    url = f"{COMPANION_URL.rstrip('/')}/api/location/{button.strip('/')}/press"
    with suppress(Exception):
        async with httpx.AsyncClient(timeout=3) as client:
            await client.post(url)


def encrypt_stream_key(stream_key: str) -> str:
    return get_fernet().encrypt(stream_key.encode()).decode()


def decrypt_stream_key(encrypted_stream_key: str) -> str:
    try:
        return get_fernet().decrypt(encrypted_stream_key.encode()).decode()
    except InvalidToken as exc:
        raise HTTPException(status_code=500, detail="Stored stream key cannot be decrypted.") from exc


async def db_execute(query: Any) -> Any:
    response = await asyncio.to_thread(query.execute)
    return response.data


async def db_select(table: str, columns: str = "*") -> list[dict[str, Any]]:
    return await db_execute(get_supabase().table(table).select(columns))


async def db_insert(table: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = await db_execute(get_supabase().table(table).insert(payload))
    return data[0] if data else {}


async def db_update(table: str, row_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = await db_execute(get_supabase().table(table).update(payload).eq("id", row_id))
    return data[0] if data else {}


async def db_delete(table: str, row_id: str) -> list[dict[str, Any]]:
    return await db_execute(get_supabase().table(table).delete().eq("id", row_id))


def first_text(node: ET.Element, names: tuple[str, ...], default: str = "0") -> str:
    for name in names:
        found = node.find(name)
        if found is not None and found.text:
            return found.text.strip()
    return default


def as_int(value: str | None) -> int:
    if not value:
        return 0
    with suppress(ValueError):
        return int(float(value))
    return 0


def parse_nginx_rtmp_stat(xml_text: str) -> StreamStatus:
    root = ET.fromstring(xml_text)
    streams = root.findall(".//stream")

    live_streams: list[dict[str, int | str]] = []
    for stream in streams:
        name = first_text(stream, ("name",), "")
        clients = len(stream.findall(".//client"))
        bytes_per_sec = as_int(first_text(stream, ("bw_in", "bytes_in", "bw"), "0"))
        uptime_ms = as_int(first_text(stream, ("time", "uptime"), "0"))
        bitrate_kbps = max(0, round((bytes_per_sec * 8) / 1000)) if bytes_per_sec else 0

        live_streams.append(
            {
                "name": name,
                "clients": clients,
                "uptime_secs": round(uptime_ms / 1000) if uptime_ms > 1000 else uptime_ms,
                "bitrate_kbps": bitrate_kbps,
            }
        )

    if not live_streams:
        return StreamStatus(updated_at=utc_now())

    primary = max(live_streams, key=lambda item: int(item["clients"]))
    return StreamStatus(
        live=True,
        uptime_secs=int(primary["uptime_secs"]),
        bitrate_kbps=int(primary["bitrate_kbps"]),
        total_viewers=sum(int(item["clients"]) for item in live_streams),
        stream_name=str(primary["name"]) or None,
        updated_at=utc_now(),
    )


async def poll_nginx_stats() -> None:
    """Poll nginx-rtmp every 5s.

    A failed fetch means we don't know the state, not that the stream ended —
    reporting offline immediately would fire a false stream-drop alert on any
    blip. Hold the last known status until several polls in a row have failed.
    """
    global latest_status, peak_viewers
    failures = 0
    async with httpx.AsyncClient(timeout=5) as client:
        while True:
            try:
                response = await client.get(RTMP_STAT_URL)
                response.raise_for_status()
                latest_status = parse_nginx_rtmp_stat(response.text)
                failures = 0
                await record_live_analytics()
            except Exception:
                failures += 1
                if failures >= POLL_FAILURES_BEFORE_OFFLINE:
                    latest_status = StreamStatus(updated_at=utc_now())

            if latest_status.live:
                peak_viewers = max(peak_viewers, latest_status.total_viewers)
                bitrate_history.append(
                    {
                        "t": latest_status.updated_at,
                        "bitrate_kbps": latest_status.bitrate_kbps,
                        "viewers": latest_status.total_viewers,
                    }
                )
            await asyncio.sleep(5)


async def websocket_broadcast_loop(websocket: WebSocket) -> None:
    while True:
        await websocket.send_json(latest_status.model_dump())
        await asyncio.sleep(5)


async def record_live_analytics() -> None:
    if not active_stream_id or supabase is None or not latest_status.live:
        return
    payload = {
        "stream_id": active_stream_id,
        "recorded_at": utc_now(),
        "viewer_count": latest_status.total_viewers,
        "bitrate_kbps": latest_status.bitrate_kbps,
    }
    with suppress(Exception):
        await db_insert("stream_analytics", payload)


async def get_enabled_destinations() -> list[dict[str, Any]]:
    data = await db_execute(
        get_supabase().table("destinations").select("*").eq("enabled", True)
    )
    return data or []


def build_nginx_config(destinations: list[dict[str, Any]]) -> str:
    push_lines = []
    for destination in destinations:
        stream_key = decrypt_stream_key(destination["stream_key"])
        target = f"{destination['rtmp_url'].rstrip('/')}/{stream_key}"
        push_lines.append(f"            push {target};")

    pushes = "\n".join(push_lines)
    return f"""load_module modules/ngx_rtmp_module.so;

worker_processes auto;

events {{
    worker_connections 1024;
}}

rtmp {{
    server {{
        listen 1935;
        chunk_size 4096;

        application live {{
            live on;
            record off;
            hls on;
            hls_path /tmp/hls;
            hls_fragment 2;
            hls_playlist_length 10;
            on_publish http://127.0.0.1:8000/api/stream/on_publish;
            on_done http://127.0.0.1:8000/api/stream/on_done;
{pushes}
        }}
    }}
}}

http {{
    server {{
        listen 8080;
        location /stat {{
            rtmp_stat all;
            rtmp_stat_stylesheet stat.xsl;
        }}
        location /hls {{
            types {{
                application/vnd.apple.mpegurl m3u8;
                video/mp2t ts;
            }}
            root /tmp;
            add_header Cache-Control no-cache;
            add_header Access-Control-Allow-Origin *;
        }}
    }}
}}
"""


async def write_nginx_config_and_reload() -> dict[str, Any]:
    if not NGINX_CONFIG_PATH:
        return {"skipped": True, "reason": "NGINX_CONFIG_PATH not configured"}

    destinations = await get_enabled_destinations()
    config_path = Path(NGINX_CONFIG_PATH)
    config_text = build_nginx_config(destinations)
    await asyncio.to_thread(config_path.write_text, config_text)
    await asyncio.to_thread(subprocess.run, ["nginx", "-s", "reload"], check=True)
    return {"destination_count": len(destinations), "config_path": str(config_path)}


async def request_payload(request: Request) -> dict[str, Any]:
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        return await request.json()
    body = (await request.body()).decode()
    parsed = parse_qs(body)
    return {key: values[-1] for key, values in parsed.items()}


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(poll_nginx_stats())
    if supabase is not None and NGINX_CONFIG_PATH:
        with suppress(Exception):
            await write_nginx_config_and_reload()


@app.websocket("/api/stream/ws")
async def stream_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    connected_websockets.add(websocket)
    try:
        await websocket_broadcast_loop(websocket)
    except WebSocketDisconnect:
        pass
    finally:
        connected_websockets.discard(websocket)


@app.get("/api/stream/status")
async def get_stream_status(_: dict = Depends(get_current_user)) -> dict[str, Any]:
    return latest_status.model_dump()


async def find_open_stream() -> str | None:
    """Recover the open session id — in-memory state is lost on backend restart."""
    with suppress(Exception):
        rows = await db_execute(
            get_supabase()
            .table("streams")
            .select("id")
            .eq("status", "live")
            .order("started_at", desc=True)
            .limit(1)
        )
        if rows:
            return rows[0]["id"]
    return None


async def ensure_stream_session(title: str | None, *, force_title: bool = False) -> dict[str, Any]:
    """Return the open stream row, creating one only if no session is already open.

    Both the UI (start_stream) and nginx (on_publish) open a session. Whichever
    fires second must adopt the existing row — inserting a second one would leave
    the first stuck at status "live" forever.
    """
    global active_stream_id, active_stream_title, peak_viewers

    if active_stream_id is None:
        active_stream_id = await find_open_stream()

    if active_stream_id:
        if force_title and title and title != active_stream_title:
            active_stream_title = title
            with suppress(Exception):
                return await db_update("streams", active_stream_id, {"title": title})
        return {"id": active_stream_id, "title": active_stream_title}

    stream = await db_insert(
        "streams",
        {
            "started_at": utc_now(),
            "status": "live",
            "title": title,
            "peak_viewers": 0,
            "total_viewers": 0,
        },
    )
    active_stream_id = stream.get("id")
    active_stream_title = title
    peak_viewers = 0
    bitrate_history.clear()
    return stream


async def do_start_stream(title: str | None) -> dict[str, Any]:
    stream = await ensure_stream_session(title, force_title=True)
    nginx_result = await write_nginx_config_and_reload()
    await trigger_companion_button(COMPANION_BUTTON_GOLIVE)
    return {"stream": stream, "nginx": nginx_result}


async def do_stop_stream() -> dict[str, Any]:
    global active_stream_id, active_stream_title, peak_viewers

    if active_stream_id is None:
        active_stream_id = await find_open_stream()
    if not active_stream_id:
        raise HTTPException(status_code=404, detail="No active stream session.")

    stream = await db_update(
        "streams",
        active_stream_id,
        {
            "ended_at": utc_now(),
            "duration_secs": latest_status.uptime_secs,
            "status": "ended",
            "peak_viewers": max(peak_viewers, latest_status.total_viewers),
            "total_viewers": latest_status.total_viewers,
        },
    )
    active_stream_id = None
    active_stream_title = None
    peak_viewers = 0
    await trigger_companion_button(COMPANION_BUTTON_STOP)
    return {"stream": stream}


@app.post("/api/stream/start")
async def start_stream(payload: StreamStartRequest | None = None, _: dict = Depends(get_current_user)) -> dict[str, Any]:
    return await do_start_stream(payload.title if payload else None)


@app.post("/api/stream/stop")
async def stop_stream(_: dict = Depends(get_current_user)) -> dict[str, Any]:
    return await do_stop_stream()


@app.post("/api/stream/stop/{dest_id}")
async def stop_destination(dest_id: UUID, _: dict = Depends(get_current_user)) -> dict[str, Any]:
    destination = await db_update("destinations", str(dest_id), {"enabled": False})
    nginx_result = await write_nginx_config_and_reload()
    if active_stream_id:
        await db_insert(
            "stream_destinations",
            {
                "stream_id": active_stream_id,
                "destination_id": str(dest_id),
                "status": "stopped",
            },
        )
    return {"destination": destination, "nginx": nginx_result}


@app.get("/api/destinations")
async def list_destinations(_: dict = Depends(get_current_user)) -> list[dict[str, Any]]:
    return await db_select("destinations")


@app.post("/api/destinations")
async def create_destination(payload: DestinationCreate, _: dict = Depends(get_current_user)) -> dict[str, Any]:
    data = payload.model_dump()
    data["stream_key"] = encrypt_stream_key(data["stream_key"])
    destination = await db_insert("destinations", data)
    await write_nginx_config_and_reload()
    return destination


@app.patch("/api/destinations/{id}")
async def update_destination(id: UUID, payload: DestinationPatch, _: dict = Depends(get_current_user)) -> dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)
    if "stream_key" in data:
        data["stream_key"] = encrypt_stream_key(data["stream_key"])
    destination = await db_update("destinations", str(id), data)
    await write_nginx_config_and_reload()
    return destination


@app.delete("/api/destinations/{id}")
async def delete_destination(id: UUID, _: dict = Depends(get_current_user)) -> dict[str, Any]:
    deleted = await db_delete("destinations", str(id))
    await write_nginx_config_and_reload()
    return {"deleted": deleted}


@app.get("/api/analytics/live")
async def live_analytics(_: dict = Depends(get_current_user)) -> dict[str, Any]:
    return latest_status.model_dump()


@app.get("/api/analytics/history")
async def analytics_history(_: dict = Depends(get_current_user)) -> list[dict[str, Any]]:
    return await db_select("streams")


@app.get("/api/analytics/stream/{id}")
async def stream_analytics(id: UUID, _: dict = Depends(get_current_user)) -> list[dict[str, Any]]:
    return await db_execute(
        get_supabase().table("stream_analytics").select("*").eq("stream_id", str(id))
    )


@app.get("/api/analytics/bitrate")
async def bitrate_chart(_: dict = Depends(get_current_user)) -> list[dict[str, Any]]:
    return list(bitrate_history)


@app.get("/api/companion/status")
async def companion_status(_: None = Depends(require_companion_key)) -> dict[str, Any]:
    destinations: list[dict[str, Any]] = []
    with suppress(Exception):
        destinations = [
            {"id": d["id"], "name": d["name"], "enabled": d["enabled"]}
            for d in await db_select("destinations", "id,name,enabled")
        ]
    return {
        "live": latest_status.live,
        "uptime_secs": latest_status.uptime_secs,
        "bitrate_kbps": latest_status.bitrate_kbps,
        "viewers": latest_status.total_viewers,
        "title": active_stream_title,
        "stream_name": latest_status.stream_name,
        "destinations": destinations,
        "updated_at": latest_status.updated_at,
    }


@app.post("/api/companion/action")
async def companion_action(payload: CompanionAction, _: None = Depends(require_companion_key)) -> dict[str, Any]:
    action = payload.action.lower()

    if action == "start_stream":
        return {"ok": True, "result": await do_start_stream(payload.title)}

    if action == "stop_stream":
        return {"ok": True, "result": await do_stop_stream()}

    if action in ("toggle_destination", "enable_destination", "disable_destination"):
        if not payload.destination_id:
            raise HTTPException(status_code=422, detail="destination_id is required.")
        if action == "toggle_destination":
            rows = await db_execute(
                get_supabase().table("destinations").select("enabled").eq("id", payload.destination_id)
            )
            if not rows:
                raise HTTPException(status_code=404, detail="Destination not found.")
            enabled = not rows[0]["enabled"]
        else:
            enabled = action == "enable_destination"
        destination = await db_update("destinations", payload.destination_id, {"enabled": enabled})
        await write_nginx_config_and_reload()
        return {"ok": True, "result": {"destination": destination}}

    raise HTTPException(status_code=422, detail=f"Unknown action: {payload.action}")


@app.get("/api/team")
async def list_team_members(_: dict = Depends(get_current_user)) -> list[dict[str, Any]]:
    return await db_select("team_members")


@app.post("/api/team/invite")
async def invite_team_member(payload: TeamInviteRequest, _: dict = Depends(get_current_user)) -> dict[str, Any]:
    user_id = payload.user_id or payload.email
    if not user_id:
        raise HTTPException(status_code=422, detail="user_id or email is required.")

    return await db_insert(
        "team_members",
        {
            "user_id": user_id,
            "role": payload.role,
            "invited_by": payload.invited_by,
            "created_at": utc_now(),
        },
    )


@app.patch("/api/team/{id}/role")
async def update_team_member_role(id: UUID, payload: TeamRolePatch, _: dict = Depends(get_current_user)) -> dict[str, Any]:
    return await db_update("team_members", str(id), {"role": payload.role})


@app.delete("/api/team/{id}")
async def delete_team_member(id: UUID, _: dict = Depends(get_current_user)) -> dict[str, Any]:
    return {"deleted": await db_delete("team_members", str(id))}


@app.post("/api/stream/thumbnail")
async def upload_thumbnail(file: UploadFile = File(...), _: dict = Depends(get_current_user)) -> dict[str, Any]:
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=422, detail="Only JPEG, PNG, and WebP images are accepted.")
    suffix = Path(file.filename or "thumb.jpg").suffix or ".jpg"
    dest = THUMBNAIL_PATH.with_suffix(suffix)
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"url": f"/api/stream/thumbnail/latest", "path": str(dest)}


@app.get("/api/stream/thumbnail/latest")
async def get_thumbnail() -> FileResponse:
    # Find whichever suffix was saved last
    for suffix in (".jpg", ".jpeg", ".png", ".webp"):
        candidate = THUMBNAIL_PATH.with_suffix(suffix)
        if candidate.exists():
            return FileResponse(candidate, media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="No thumbnail uploaded yet.")


@app.post("/api/stream/on_publish")
async def on_publish(request: Request) -> dict[str, Any]:
    payload = await request_payload(request)
    stream_name = payload.get("name") or payload.get("stream") or latest_status.stream_name
    # A DB failure must not reject the publish — nginx treats a non-2xx as "deny".
    try:
        stream = await ensure_stream_session(stream_name)
    except Exception:
        stream = {}
    return {"ok": True, "stream": stream}


@app.post("/api/stream/on_done")
async def on_done(request: Request) -> dict[str, Any]:
    global active_stream_id, active_stream_title, peak_viewers
    payload = await request_payload(request)
    stream_id = payload.get("stream_id") or active_stream_id or await find_open_stream()
    if not stream_id:
        return {"ok": True, "stream": None}

    stream = {}
    with suppress(Exception):
        stream = await db_update(
            "streams",
            str(stream_id),
            {
                "ended_at": utc_now(),
                "duration_secs": latest_status.uptime_secs,
                "status": "ended",
                "peak_viewers": max(peak_viewers, latest_status.total_viewers),
                "total_viewers": latest_status.total_viewers,
            },
        )
    if active_stream_id == str(stream_id):
        active_stream_id = None
        active_stream_title = None
        peak_viewers = 0
    return {"ok": True, "stream": stream}
