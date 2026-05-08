import asyncio
import os
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
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
from fastapi.responses import FileResponse
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
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

THUMBNAIL_PATH = Path(tempfile.gettempdir()) / "gm_stream_thumbnail.jpg"

supabase: Any | None = (
    create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None
)

app = FastAPI(title="GM Stream Control Panel API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


latest_status = StreamStatus()
active_stream_id: str | None = None
connected_websockets: set[WebSocket] = set()


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
    """Validate Supabase JWT from Authorization header. Skip if JWT secret not configured."""
    if not SUPABASE_JWT_SECRET:
        return {}
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = auth.removeprefix("Bearer ").strip()
    try:
        payload = pyjwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except pyjwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token has expired.") from exc
    except pyjwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid token.") from exc


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
    global latest_status
    async with httpx.AsyncClient(timeout=5) as client:
        while True:
            try:
                response = await client.get(RTMP_STAT_URL)
                response.raise_for_status()
                latest_status = parse_nginx_rtmp_stat(response.text)
                await record_live_analytics()
            except Exception:
                latest_status = StreamStatus(updated_at=utc_now())
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
    return f"""worker_processes auto;

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
    }}
}}
"""


async def write_nginx_config_and_reload() -> dict[str, Any]:
    if not NGINX_CONFIG_PATH:
        raise HTTPException(status_code=503, detail="NGINX_CONFIG_PATH is not configured.")

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


@app.post("/api/stream/start")
async def start_stream(payload: StreamStartRequest | None = None, _: dict = Depends(get_current_user)) -> dict[str, Any]:
    global active_stream_id
    stream = await db_insert(
        "streams",
        {
            "started_at": utc_now(),
            "status": "live",
            "title": payload.title if payload else None,
            "peak_viewers": 0,
            "total_viewers": 0,
        },
    )
    active_stream_id = stream.get("id")
    nginx_result = await write_nginx_config_and_reload()
    return {"stream": stream, "nginx": nginx_result}


@app.post("/api/stream/stop")
async def stop_stream(_: dict = Depends(get_current_user)) -> dict[str, Any]:
    global active_stream_id
    if not active_stream_id:
        raise HTTPException(status_code=404, detail="No active stream session.")

    duration_secs = latest_status.uptime_secs
    stream = await db_update(
        "streams",
        active_stream_id,
        {
            "ended_at": utc_now(),
            "duration_secs": duration_secs,
            "status": "ended",
            "peak_viewers": latest_status.total_viewers,
            "total_viewers": latest_status.total_viewers,
        },
    )
    active_stream_id = None
    return {"stream": stream}


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
    global active_stream_id
    payload = await request_payload(request)
    stream_name = payload.get("name") or payload.get("stream") or latest_status.stream_name
    stream = await db_insert(
        "streams",
        {
            "started_at": utc_now(),
            "status": "live",
            "title": stream_name,
            "peak_viewers": 0,
            "total_viewers": 0,
        },
    )
    active_stream_id = stream.get("id")
    return {"ok": True, "stream": stream}


@app.post("/api/stream/on_done")
async def on_done(request: Request) -> dict[str, Any]:
    global active_stream_id
    payload = await request_payload(request)
    stream_id = payload.get("stream_id") or active_stream_id
    if not stream_id:
        return {"ok": True, "stream": None}

    stream = await db_update(
        "streams",
        str(stream_id),
        {
            "ended_at": utc_now(),
            "duration_secs": latest_status.uptime_secs,
            "status": "ended",
            "peak_viewers": latest_status.total_viewers,
            "total_viewers": latest_status.total_viewers,
        },
    )
    if active_stream_id == str(stream_id):
        active_stream_id = None
    return {"ok": True, "stream": stream}
