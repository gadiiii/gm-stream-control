"""Tests for the RTMP stream-key probe.

The encode/decode and URL handling are unit-testable here. The protocol
conversation itself is covered end to end in test-env (scenario 6), against a
sink that accepts and one that refuses.
"""

import asyncio
import struct

import pytest
import rtmp_probe


def test_amf_string_round_trip():
    encoded = rtmp_probe.amf_string("NetStream.Publish.Start")
    value, offset = rtmp_probe.decode_amf0(encoded)
    assert value == "NetStream.Publish.Start"
    assert offset == len(encoded)


def test_amf_number_round_trip():
    value, _ = rtmp_probe.decode_amf0(rtmp_probe.amf_number(42.0))
    assert value == 42.0


def test_amf_object_round_trip():
    encoded = rtmp_probe.amf_object({"app": "live2", "tcUrl": "rtmp://host/live2"})
    value, _ = rtmp_probe.decode_amf0(encoded)
    assert value == {"app": "live2", "tcUrl": "rtmp://host/live2"}


def test_decode_onstatus_payload():
    """The shape a platform actually sends back after a publish request."""
    payload = (
        rtmp_probe.amf_string("onStatus")
        + rtmp_probe.amf_number(0)
        + rtmp_probe.amf_null()
        + rtmp_probe.amf_object(
            {"level": "status", "code": "NetStream.Publish.Start", "description": "Started"}
        )
    )
    values = rtmp_probe.decode_amf0_all(payload)
    assert values[0] == "onStatus"
    info = next(v for v in values if isinstance(v, dict))
    assert info["code"] == "NetStream.Publish.Start"


@pytest.mark.parametrize(
    "url,expected",
    [
        ("rtmp://a.rtmp.youtube.com/live2", ("rtmp", "a.rtmp.youtube.com", 1935, "live2", False)),
        (
            "rtmps://live-api-s.facebook.com:443/rtmp",
            ("rtmps", "live-api-s.facebook.com", 443, "rtmp", True),
        ),
        ("rtmp://host:1936/live", ("rtmp", "host", 1936, "live", False)),
    ],
)
def test_split_rtmp_url(url, expected):
    assert rtmp_probe.split_rtmp_url(url) == expected


def test_rtmps_defaults_to_port_443():
    _, _, port, _, use_tls = rtmp_probe.split_rtmp_url("rtmps://live-api-s.facebook.com/rtmp")
    assert port == 443
    assert use_tls is True


@pytest.mark.asyncio
async def test_url_without_a_host_is_unreachable():
    result = await rtmp_probe.validate_stream_key("not-a-url", "key")
    assert result.status == "unreachable"
    assert result.ok is False


@pytest.mark.asyncio
async def test_url_without_an_application_path_is_rejected_early():
    """rtmp://host with no /app can never work — say so instead of dialling."""
    result = await rtmp_probe.validate_stream_key("rtmp://a.rtmp.youtube.com", "key")
    assert result.status == "unreachable"
    assert "application path" in result.detail


@pytest.mark.asyncio
async def test_closed_port_is_unreachable_not_rejected():
    """A dead port must not be reported as a bad stream key."""
    result = await rtmp_probe.validate_stream_key("rtmp://127.0.0.1:1/live", "key", timeout=3)
    assert result.status == "unreachable"


@pytest.mark.asyncio
async def test_server_that_hangs_up_during_handshake_is_unreachable():
    """No publish was sent, so this is a connection problem, not a key problem."""

    async def hang_up(reader, writer):
        writer.close()

    server = await asyncio.start_server(hang_up, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    async with server:
        result = await rtmp_probe.validate_stream_key(f"rtmp://127.0.0.1:{port}/live", "k", timeout=4)
    assert result.status == "unreachable"


def test_probe_result_serialises_ok_flag():
    assert rtmp_probe.ProbeResult("ok").as_dict()["ok"] is True
    assert rtmp_probe.ProbeResult("rejected").as_dict()["ok"] is False
    assert rtmp_probe.ProbeResult("inconclusive").as_dict()["ok"] is False


def test_bad_code_hints_catch_common_platform_refusals():
    for code in ("NetStream.Publish.BadName", "NetConnection.Connect.Rejected"):
        assert any(hint in code for hint in rtmp_probe.BAD_CODE_HINTS)
