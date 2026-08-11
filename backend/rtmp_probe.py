"""Validate an RTMP stream key by asking the platform to accept a publish.

A TCP connect proves the host is reachable; it says nothing about whether the
stream key is right. A wrong or expired key looks identical until the service
starts — which is how "the platform rejected the stream" happens on a Sunday.

This performs a real RTMP handshake, `connect`, `createStream` and `publish`,
reads the platform's answer, and disconnects. **No audio or video is ever
sent.** Platforms validate the key at the `publish` command, so the answer
arrives before any media would.

That said, this is not a completely invisible operation: a publish request is a
real request, and some platforms will show the ingest as "starting" or
"connecting" while it is open (well under a second here). Treat it as a
pre-flight check to run before a service, not something to poll.

Returns one of:
    ok            — the platform accepted the key
    rejected      — the platform refused it (bad/expired key, wrong app)
    unreachable   — could not connect at all
    inconclusive  — connected, but no clear answer within the timeout
"""

import asyncio
import random
import ssl
import struct
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

RTMP_VERSION = 3
HANDSHAKE_SIZE = 1536
DEFAULT_CHUNK_SIZE = 128

# Message type IDs we care about.
MSG_SET_CHUNK_SIZE = 1
MSG_ABORT = 2
MSG_ACK = 3
MSG_USER_CONTROL = 4
MSG_WINDOW_ACK_SIZE = 5
MSG_SET_PEER_BANDWIDTH = 6
MSG_AMF0_COMMAND = 20

DEFAULT_PORTS = {"rtmp": 1935, "rtmps": 443}

# Publish status codes. NetStream.Publish.Start is the success we're looking
# for; the rest are the ways a platform says "no".
GOOD_CODES = {"NetStream.Publish.Start"}
BAD_CODE_HINTS = ("BadName", "Failed", "Rejected", "Denied", "Unauthorized", "Error")


@dataclass
class ProbeResult:
    status: str
    detail: str = ""
    code: str = ""
    latency_ms: int = 0
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        """Only an explicit acceptance counts. Anything else needs a human."""
        return self.status == "ok"

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "ok": self.ok,
            "detail": self.detail,
            "code": self.code,
            "latency_ms": self.latency_ms,
            **self.extra,
        }


# ── AMF0 encoding ─────────────────────────────────────────────────────────────


def amf_number(value: float) -> bytes:
    return b"\x00" + struct.pack(">d", value)


def amf_boolean(value: bool) -> bytes:
    return b"\x01" + (b"\x01" if value else b"\x00")


def amf_string(value: str) -> bytes:
    encoded = value.encode("utf-8")
    return b"\x02" + struct.pack(">H", len(encoded)) + encoded


def amf_null() -> bytes:
    return b"\x05"


def amf_object(properties: dict[str, Any]) -> bytes:
    out = b"\x03"
    for key, value in properties.items():
        encoded_key = key.encode("utf-8")
        out += struct.pack(">H", len(encoded_key)) + encoded_key
        if isinstance(value, bool):
            out += amf_boolean(value)
        elif isinstance(value, (int, float)):
            out += amf_number(value)
        elif value is None:
            out += amf_null()
        else:
            out += amf_string(str(value))
    return out + b"\x00\x00\x09"


# ── AMF0 decoding ─────────────────────────────────────────────────────────────


def decode_amf0(data: bytes, offset: int = 0) -> tuple[Any, int]:
    """Decode one AMF0 value. Returns (value, new_offset)."""
    if offset >= len(data):
        return None, offset

    marker = data[offset]
    offset += 1

    if marker == 0x00:  # number
        return struct.unpack(">d", data[offset : offset + 8])[0], offset + 8
    if marker == 0x01:  # boolean
        return bool(data[offset]), offset + 1
    if marker == 0x02:  # string
        (length,) = struct.unpack(">H", data[offset : offset + 2])
        offset += 2
        return data[offset : offset + length].decode("utf-8", "replace"), offset + length
    if marker == 0x05 or marker == 0x06:  # null / undefined
        return None, offset
    if marker == 0x03 or marker == 0x08:  # object / ecma-array
        if marker == 0x08:
            offset += 4  # associative count, unreliable — read to the end marker
        obj: dict[str, Any] = {}
        while offset < len(data):
            if data[offset : offset + 3] == b"\x00\x00\x09":
                return obj, offset + 3
            (key_length,) = struct.unpack(">H", data[offset : offset + 2])
            offset += 2
            key = data[offset : offset + key_length].decode("utf-8", "replace")
            offset += key_length
            value, offset = decode_amf0(data, offset)
            obj[key] = value
        return obj, offset

    # Anything else (strict array, date, long string…) isn't used by the
    # commands we send; stop rather than guess.
    return None, len(data)


def decode_amf0_all(data: bytes) -> list[Any]:
    values: list[Any] = []
    offset = 0
    while offset < len(data):
        before = offset
        value, offset = decode_amf0(data, offset)
        if offset <= before:
            break
        values.append(value)
    return values


# ── Chunk stream ──────────────────────────────────────────────────────────────


class RtmpConnection:
    """Minimal RTMP client: enough to connect and publish, nothing more."""

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader = reader
        self.writer = writer
        self.out_chunk_size = DEFAULT_CHUNK_SIZE
        self.in_chunk_size = DEFAULT_CHUNK_SIZE
        # Per-chunk-stream reassembly state.
        self._partial: dict[int, bytearray] = {}
        self._expected: dict[int, int] = {}
        self._type: dict[int, int] = {}
        self._last_header: dict[int, tuple[int, int, int]] = {}

    async def handshake(self) -> None:
        c1 = struct.pack(">I", 0) + struct.pack(">I", 0)
        c1 += bytes(random.getrandbits(8) for _ in range(HANDSHAKE_SIZE - 8))
        self.writer.write(bytes([RTMP_VERSION]) + c1)
        await self.writer.drain()

        s0 = await self.reader.readexactly(1)
        if s0[0] != RTMP_VERSION:
            raise ConnectionError(f"server offered RTMP version {s0[0]}, expected {RTMP_VERSION}")
        s1 = await self.reader.readexactly(HANDSHAKE_SIZE)
        await self.reader.readexactly(HANDSHAKE_SIZE)  # S2

        self.writer.write(s1)  # C2 echoes S1
        await self.writer.drain()

    def _write_message(self, csid: int, type_id: int, stream_id: int, payload: bytes) -> None:
        # Type 0 header: full timestamp, length, type, stream id (little endian).
        header = bytes([csid])
        header += b"\x00\x00\x00"
        header += struct.pack(">I", len(payload))[1:]
        header += bytes([type_id])
        header += struct.pack("<I", stream_id)

        first = payload[: self.out_chunk_size]
        self.writer.write(header + first)

        # Continuation chunks reuse the header (fmt=3).
        rest = payload[self.out_chunk_size :]
        while rest:
            self.writer.write(bytes([0xC0 | csid]) + rest[: self.out_chunk_size])
            rest = rest[self.out_chunk_size :]

    async def send_command(self, csid: int, stream_id: int, *values: bytes) -> None:
        self._write_message(csid, MSG_AMF0_COMMAND, stream_id, b"".join(values))
        await self.writer.drain()

    async def read_message(self) -> tuple[int, bytes]:
        """Read until one complete message is reassembled. Returns (type, payload)."""
        while True:
            first = (await self.reader.readexactly(1))[0]
            fmt = first >> 6
            csid = first & 0x3F

            if csid == 0:
                csid = 64 + (await self.reader.readexactly(1))[0]
            elif csid == 1:
                data = await self.reader.readexactly(2)
                csid = 64 + data[0] + (data[1] << 8)

            if fmt == 0:
                head = await self.reader.readexactly(11)
                timestamp = int.from_bytes(head[0:3], "big")
                length = int.from_bytes(head[3:6], "big")
                type_id = head[6]
                stream_id = struct.unpack("<I", head[7:11])[0]
            elif fmt == 1:
                head = await self.reader.readexactly(7)
                timestamp = int.from_bytes(head[0:3], "big")
                length = int.from_bytes(head[3:6], "big")
                type_id = head[6]
                stream_id = self._last_header.get(csid, (0, 0, 0))[2]
            elif fmt == 2:
                head = await self.reader.readexactly(3)
                timestamp = int.from_bytes(head[0:3], "big")
                length, type_id, stream_id = self._last_header.get(csid, (0, 0, 0))
            else:  # fmt == 3, continuation
                timestamp = 0
                length, type_id, stream_id = self._last_header.get(csid, (0, 0, 0))

            if timestamp == 0xFFFFFF:
                await self.reader.readexactly(4)  # extended timestamp

            self._last_header[csid] = (length, type_id, stream_id)

            if csid not in self._partial or self._expected.get(csid, 0) == 0:
                self._partial[csid] = bytearray()
                self._expected[csid] = length
                self._type[csid] = type_id

            remaining = self._expected[csid] - len(self._partial[csid])
            take = min(remaining, self.in_chunk_size)
            if take > 0:
                self._partial[csid] += await self.reader.readexactly(take)

            if len(self._partial[csid]) >= self._expected[csid]:
                payload = bytes(self._partial[csid])
                type_id = self._type[csid]
                self._partial[csid] = bytearray()
                self._expected[csid] = 0

                # Handle protocol control messages transparently.
                if type_id == MSG_SET_CHUNK_SIZE and len(payload) >= 4:
                    self.in_chunk_size = struct.unpack(">I", payload[:4])[0] & 0x7FFFFFFF
                    continue
                if type_id in (MSG_ACK, MSG_ABORT, MSG_USER_CONTROL, MSG_SET_PEER_BANDWIDTH):
                    continue
                if type_id == MSG_WINDOW_ACK_SIZE:
                    continue

                return type_id, payload

    async def close(self) -> None:
        try:
            self.writer.close()
            await asyncio.wait_for(self.writer.wait_closed(), timeout=2)
        except Exception:
            pass


async def _await_command(connection: RtmpConnection, names: set[str], timeout: float) -> list[Any]:
    """Read commands until one of `names` arrives, or time out."""
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise asyncio.TimeoutError
        type_id, payload = await asyncio.wait_for(connection.read_message(), timeout=remaining)
        if type_id != MSG_AMF0_COMMAND:
            continue
        values = decode_amf0_all(payload)
        if values and isinstance(values[0], str) and values[0] in names:
            return values


def split_rtmp_url(rtmp_url: str) -> tuple[str, str, int, str, bool]:
    """Split an RTMP URL into (scheme, host, port, app, use_tls)."""
    parsed = urlparse(rtmp_url.strip())
    scheme = (parsed.scheme or "rtmp").lower()
    host = parsed.hostname or ""
    port = parsed.port or DEFAULT_PORTS.get(scheme, 1935)
    app = parsed.path.lstrip("/")
    return scheme, host, port, app, scheme == "rtmps"


async def validate_stream_key(rtmp_url: str, stream_key: str, timeout: float = 12) -> ProbeResult:
    """Connect and ask the platform to accept a publish of `stream_key`."""
    scheme, host, port, app, use_tls = split_rtmp_url(rtmp_url)
    if not host:
        return ProbeResult("unreachable", f"Could not parse a hostname from {rtmp_url!r}.")
    if not app:
        return ProbeResult(
            "unreachable",
            f"{rtmp_url!r} has no application path (expected something like rtmp://host/live2).",
        )

    started = time.perf_counter()
    connection: RtmpConnection | None = None
    publish_sent = False

    try:
        ssl_context = None
        if use_tls:
            ssl_context = ssl.create_default_context()
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port, ssl=ssl_context, server_hostname=host if use_tls else None),
            timeout=min(timeout, 8),
        )
        connection = RtmpConnection(reader, writer)
        await asyncio.wait_for(connection.handshake(), timeout=min(timeout, 8))

        tc_url = f"{scheme}://{host}:{port}/{app}"
        await connection.send_command(
            3,
            0,
            amf_string("connect"),
            amf_number(1),
            amf_object(
                {
                    "app": app,
                    "type": "nonprivate",
                    "flashVer": "FMLE/3.0 (compatible; GMStreamControl)",
                    "tcUrl": tc_url,
                }
            ),
        )

        values = await _await_command(connection, {"_result", "_error"}, timeout)
        if values[0] == "_error":
            info = next((v for v in values if isinstance(v, dict) and "code" in v), {})
            return ProbeResult(
                "rejected",
                f"The server refused the connection to /{app}: {info.get('description') or info.get('code')}",
                str(info.get("code", "")),
                round((time.perf_counter() - started) * 1000),
            )

        await connection.send_command(3, 0, amf_string("createStream"), amf_number(2), amf_null())
        values = await _await_command(connection, {"_result", "_error"}, timeout)
        stream_id = 1
        for value in values:
            if isinstance(value, float):
                stream_id = int(value)

        # This is the request that actually tests the key.
        await connection.send_command(
            4,
            stream_id,
            amf_string("publish"),
            amf_number(0),
            amf_null(),
            amf_string(stream_key),
            amf_string("live"),
        )
        publish_sent = True

        values = await _await_command(connection, {"onStatus", "_error"}, timeout)
        info = next((v for v in values if isinstance(v, dict) and "code" in v), {})
        code = str(info.get("code", ""))
        description = str(info.get("description", "") or "")
        latency = round((time.perf_counter() - started) * 1000)

        if code in GOOD_CODES:
            return ProbeResult("ok", "The platform accepted this stream key.", code, latency)

        if any(hint in code for hint in BAD_CODE_HINTS) or values[0] == "_error":
            return ProbeResult(
                "rejected",
                description or f"The platform refused this stream key ({code}).",
                code,
                latency,
            )

        return ProbeResult(
            "inconclusive",
            description or f"Unexpected response from the platform: {code or 'no status code'}.",
            code,
            latency,
        )

    except asyncio.TimeoutError:
        return ProbeResult(
            "inconclusive",
            "Connected, but the platform did not answer the publish request in time.",
            latency_ms=round((time.perf_counter() - started) * 1000),
        )
    except (asyncio.IncompleteReadError, ConnectionError, OSError, ssl.SSLError) as exc:
        latency = round((time.perf_counter() - started) * 1000)
        if publish_sent:
            # We got all the way to a publish request and the server hung up
            # without answering. Servers that validate keys frequently refuse
            # this way instead of returning an RTMP error — nginx-rtmp's
            # on_publish hook does exactly this, and so do several platforms.
            return ProbeResult(
                "rejected",
                "The server closed the connection immediately after the publish "
                "request, which almost always means the stream key was refused.",
                "ConnectionClosedAfterPublish",
                latency,
            )
        return ProbeResult(
            "unreachable",
            f"Could not complete an RTMP session with {host}:{port} — {exc}",
            latency_ms=latency,
        )
    except Exception as exc:  # noqa: BLE001 - never let a probe break the request
        return ProbeResult("inconclusive", f"Probe failed unexpectedly: {exc}")
    finally:
        if connection:
            await connection.close()
