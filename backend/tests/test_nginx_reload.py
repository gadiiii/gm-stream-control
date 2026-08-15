"""Tests for the write-and-reload state machine.

Three behaviours here were each fixed in response to a real incident and are
easy to regress:

  * b85c783 — a failed reload must not fail the caller's request.
  * 0adbadc — never reload while a stream is publishing; it drops the stream.
  * the rollback — an invalid generated config must not be left on disk, or the
    next nginx restart fails on a file we wrote.
"""

import subprocess

import main
import pytest


def ok(*_args) -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess([], 0, "", "")


def fail(stderr: str = "boom"):
    def run(*_args) -> subprocess.CompletedProcess:
        return subprocess.CompletedProcess([], 1, "", stderr)

    return run


@pytest.fixture
def nginx(monkeypatch, tmp_path):
    """Point the module at a temp config file with a stubbed nginx binary."""
    config_path = tmp_path / "nginx.conf"
    config_path.write_text("# previous config\n")

    monkeypatch.setattr(main, "NGINX_CONFIG_PATH", str(config_path))
    monkeypatch.setattr(main, "nginx_reload_pending", False)

    async def no_destinations():
        return []

    monkeypatch.setattr(main, "get_enabled_destinations", no_destinations)
    monkeypatch.setattr(main, "run_command", ok)

    async def idle():
        return False

    monkeypatch.setattr(main, "publisher_active", idle)
    return config_path


def publishing(monkeypatch):
    async def live():
        return True

    monkeypatch.setattr(main, "publisher_active", live)


@pytest.mark.asyncio
async def test_writes_config_and_reports_ok(nginx):
    result = await main.write_nginx_config_and_reload()

    assert result["ok"] is True
    assert "rtmp {" in nginx.read_text()


@pytest.mark.asyncio
async def test_skips_entirely_when_no_config_path_is_set(monkeypatch):
    monkeypatch.setattr(main, "NGINX_CONFIG_PATH", "")
    result = await main.write_nginx_config_and_reload()
    assert result == {"ok": True, "skipped": True, "reason": "NGINX_CONFIG_PATH not configured"}


@pytest.mark.asyncio
async def test_defers_the_reload_while_a_stream_is_publishing(nginx, monkeypatch):
    publishing(monkeypatch)

    def explode(cmd):
        raise AssertionError(f"must not run {cmd} while publishing")

    monkeypatch.setattr(main, "run_command", explode)

    result = await main.write_nginx_config_and_reload()

    assert result["deferred"] is True
    assert result["ok"] is True
    assert main.nginx_reload_pending is True
    # The new config is still written — only the reload waits.
    assert "rtmp {" in nginx.read_text()


@pytest.mark.asyncio
async def test_force_reloads_even_while_publishing(nginx, monkeypatch):
    """This is how the poller applies the deferred reload once it's safe."""
    publishing(monkeypatch)
    calls = []
    monkeypatch.setattr(main, "run_command", lambda cmd: calls.append(cmd) or ok())

    result = await main.write_nginx_config_and_reload(force=True)

    assert result["ok"] is True
    assert ["nginx", "-s", "reload"] in calls
    assert main.nginx_reload_pending is False


@pytest.mark.asyncio
async def test_invalid_config_is_rolled_back(nginx, monkeypatch):
    monkeypatch.setattr(main, "run_command", fail("unexpected }"))

    result = await main.write_nginx_config_and_reload()

    assert result["ok"] is False
    assert "invalid" in result["error"]
    assert nginx.read_text() == "# previous config\n"


@pytest.mark.asyncio
async def test_a_failed_reload_is_reported_not_raised(nginx, monkeypatch):
    """The destination change is already committed by this point, so raising
    would report failure for a change that actually saved."""

    def run(cmd):
        return ok() if cmd[:2] == ["nginx", "-t"] else fail("no pid file")(cmd)

    monkeypatch.setattr(main, "run_command", run)

    result = await main.write_nginx_config_and_reload()

    assert result["ok"] is False
    assert "reload failed" in result["error"]
    # Config stays on disk so a later restart picks it up.
    assert "rtmp {" in nginx.read_text()


@pytest.mark.asyncio
async def test_falls_back_to_systemctl_when_nginx_s_reload_fails(nginx, monkeypatch):
    calls = []

    def run(cmd):
        calls.append(cmd)
        if cmd[:2] == ["nginx", "-s"]:
            return fail("no pid file")(cmd)
        return ok()

    monkeypatch.setattr(main, "run_command", run)

    result = await main.write_nginx_config_and_reload()

    assert result["ok"] is True
    assert ["systemctl", "reload", "nginx"] in calls


@pytest.mark.asyncio
async def test_undecryptable_destinations_are_reported_to_the_caller(nginx, monkeypatch):
    async def one_good_one_bad():
        return [
            {
                "id": "1",
                "name": "YouTube",
                "rtmp_url": "rtmp://a.rtmp.youtube.com/live2",
                "stream_key": main.encrypt_stream_key("yt-key"),
            },
            {"id": "2", "name": "Facebook", "rtmp_url": "rtmp://fb", "stream_key": "garbage"},
        ]

    monkeypatch.setattr(main, "get_enabled_destinations", one_good_one_bad)

    result = await main.write_nginx_config_and_reload()

    assert result["ok"] is True
    assert result["skipped_destinations"] == ["Facebook"]
    assert result["destination_count"] == 1
    assert "push rtmp://a.rtmp.youtube.com/live2/yt-key;" in nginx.read_text()
