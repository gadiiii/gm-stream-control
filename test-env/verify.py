"""Acceptance test for multi-platform fan-out. Run with the stack up.

    python test-env/verify.py                # all scenarios, manages its own feed
    python test-env/verify.py --scenario 1   # just the fan-out check
    python test-env/verify.py --keep-feed    # a feed is already running; don't start one

The point of this file: prove that one input feed reaches BOTH destinations at
the same time, without being onsite and without touching the church's
equipment. Scenario 1 is the regression that started all of this — the dropped
`resolver` directive (d73ed66) made every external push fail silently while
local ingest kept working, so watching the origin alone would have shown green.

The sinks are the evidence. If a sink's /stat reports a live stream, the push
leg from the origin demonstrably carried real frames.
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

TEST_ENV = Path(__file__).resolve().parent
REPO = TEST_ENV.parent
sys.path.insert(0, str(REPO / "backend"))

import httpx  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(TEST_ENV / ".env")

import main  # noqa: E402

ORIGIN_STAT = "http://localhost:8080/stat"
SINKS = {"YouTube": "http://localhost:8081/stat", "Facebook": "http://localhost:8082/stat"}
API = "http://localhost:8000"
CONTAINER = "gm-test-server"

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"

failures: list[str] = []
_auth_headers: dict[str, str] = {}


def sign_in() -> dict[str, str]:
    """Authenticate as the staging test user.

    Deliberately goes through the real auth path rather than bypassing it — the
    endpoints under test are the ones the dashboard actually calls.
    """
    import os

    from supabase import create_client

    email = os.getenv("SUPABASE_TEST_EMAIL", "")
    password = os.getenv("SUPABASE_TEST_PASSWORD", "")
    if not email or not password:
        sys.exit(
            "SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD must be set in test-env/.env.\n"
            "Create a user in the staging Supabase project and put its credentials there."
        )

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    session = client.auth.sign_in_with_password({"email": email, "password": password})
    if not session or not session.session:
        sys.exit(f"Could not sign in as {email} against the staging project.")
    return {"Authorization": f"Bearer {session.session.access_token}"}


def api_get(path: str, **kwargs) -> httpx.Response:
    return httpx.get(f"{API}{path}", headers=_auth_headers, timeout=10, **kwargs)


def api_patch(path: str, **kwargs) -> httpx.Response:
    return httpx.patch(f"{API}{path}", headers=_auth_headers, timeout=15, **kwargs)


def regenerate_config(destination_id: str) -> dict:
    """Force a config regeneration through the normal API surface.

    There is no dedicated reload endpoint; every destination write triggers
    write_nginx_config_and_reload, so a no-op PATCH is the supported way to make
    the backend rebuild nginx.conf — and it returns that function's result.
    """
    response = api_patch(f"/api/destinations/{destination_id}", json={"enabled": True})
    return response.json().get("nginx", {}) if response.status_code == 200 else {}


def check(name: str, ok: bool, detail: str = "") -> bool:
    mark = f"{GREEN}PASS{RESET}" if ok else f"{RED}FAIL{RESET}"
    print(f"  [{mark}] {name}")
    if detail:
        print(f"         {DIM}{detail}{RESET}")
    if not ok:
        failures.append(name)
    return ok


def heading(text: str) -> None:
    print(f"\n{text}\n{'-' * len(text)}")


def stat(url: str):
    """Parse a /stat endpoint with the same parser the backend uses."""
    try:
        response = httpx.get(url, timeout=5)
        response.raise_for_status()
        return main.parse_nginx_rtmp_stat(response.text)
    except Exception as exc:
        print(f"         {DIM}could not read {url}: {exc}{RESET}")
        return None


def wait_for_live(url: str, timeout: float = 25) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = stat(url)
        if status and status.live:
            return True
        time.sleep(1)
    return False


def in_container(*cmd: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "exec", CONTAINER, *cmd], capture_output=True, text=True, timeout=30
    )


def generated_config() -> str:
    result = in_container("cat", "/etc/nginx/nginx.conf")
    return result.stdout if result.returncode == 0 else ""


class Feed:
    """The synthetic feed, started and stopped around the scenarios."""

    def __init__(self, manage: bool):
        self.manage = manage
        self.process: subprocess.Popen | None = None
        # Keep ffmpeg's output. Discarding it makes a feed that failed to start
        # look identical to a fan-out that didn't work.
        self.log = TEST_ENV / ".stream.log"

    def start(self) -> None:
        if not self.manage:
            return
        handle = self.log.open("w")
        self.process = subprocess.Popen(
            [str(TEST_ENV / "stream.sh")], stdout=handle, stderr=subprocess.STDOUT
        )

    def failed_early(self) -> str:
        """If ffmpeg died, return why — otherwise an empty string."""
        if not self.process or self.process.poll() is None:
            return ""
        tail = self.log.read_text().strip().splitlines() if self.log.exists() else []
        return tail[-1][:200] if tail else f"exited with status {self.process.returncode}"

    def stop(self) -> None:
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None


def scenario_1_fanout(feed: Feed) -> None:
    heading("1. Fan-out — one feed reaches every enabled destination")

    if not check("origin is receiving the feed", wait_for_live(ORIGIN_STAT)):
        reason = feed.failed_early()
        if reason:
            print(f"         {YELLOW}The feed never started: {reason}{RESET}")
        else:
            print(f"         {YELLOW}Nothing published to the origin; later checks are meaningless.{RESET}")
        return

    for platform, url in SINKS.items():
        live = wait_for_live(url, timeout=20)
        status = stat(url)
        detail = ""
        if not live:
            detail = "sink received nothing — the push leg failed (check the resolver directive)"
        elif status:
            detail = f"stream {status.stream_name!r}, {status.bitrate_kbps} kbps"
        check(f"{platform} sink received the stream", live, detail)


def scenario_2_config() -> None:
    heading("2. Generated config is well formed")

    config = generated_config()
    if not check("read nginx.conf from the container", bool(config)):
        return

    # `resolver` is not a directive this rtmp module knows; nginx refuses to
    # start with it. Assert its ABSENCE — the opposite of what the commit
    # history suggests, and confirmed against the real module here.
    resolver_lines = [l.strip() for l in config.splitlines() if l.strip().startswith("resolver")]
    check(
        "no unsupported resolver directive",
        not resolver_lines,
        f"found {resolver_lines} — nginx will refuse to start" if resolver_lines else "",
    )

    pushes = [l.strip() for l in config.splitlines() if l.strip().startswith("push ")]
    rows = api_get("/api/destinations")
    expected = len([r for r in rows.json() if r["enabled"]]) if rows.status_code == 200 else len(SINKS)
    check(
        f"one push line per enabled destination ({expected})",
        len(pushes) == expected,
        (f"found {len(pushes)}: " + ", ".join(pushes)) if pushes else "found none",
    )

    test = in_container("nginx", "-t")
    check(
        "nginx -t accepts the generated config",
        test.returncode == 0,
        (test.stderr or test.stdout).strip().splitlines()[-1] if test.stderr or test.stdout else "",
    )


def scenario_3_deferred_reload(feed: Feed) -> None:
    heading("3. Reload is deferred while publishing (never drop a live stream)")

    if not stat(ORIGIN_STAT) or not stat(ORIGIN_STAT).live:
        check("feed is live before toggling", False, "no live feed; skipping")
        return

    rows = api_get("/api/destinations")
    if rows.status_code != 200:
        check("list destinations", False, f"HTTP {rows.status_code} — is auth configured?")
        return

    target = rows.json()[0]
    response = api_patch(f"/api/destinations/{target['id']}", json={"enabled": False})
    body = response.json() if response.status_code == 200 else {}
    nginx_result = body.get("nginx", {})

    check(
        "toggling mid-stream reports the reload as deferred",
        nginx_result.get("deferred") is True,
        f"nginx result: {nginx_result}",
    )

    time.sleep(3)
    still_live = stat(ORIGIN_STAT)
    check(
        "the live stream survived the change",
        bool(still_live and still_live.live),
        "reloading here would have dropped the service mid-sermon",
    )

    # Put it back so the next run starts clean.
    api_patch(f"/api/destinations/{target['id']}", json={"enabled": True})


def scenario_4_bad_key() -> None:
    heading("4. One unreadable stream key does not take down the others")

    import os

    from supabase import create_client

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    rows = client.table("destinations").select("*").execute().data or []
    if len(rows) < 2:
        check("two destinations to test with", False, f"found {len(rows)}")
        return

    victim, healthy = rows[0], rows[1]
    original = victim["stream_key"]
    client.table("destinations").update({"stream_key": "not-valid-ciphertext"}).eq(
        "id", victim["id"]
    ).execute()

    try:
        result = regenerate_config(healthy["id"])
        skipped = result.get("skipped_destinations", [])

        check(
            "the broken destination is named, not silently dropped",
            victim["name"] in skipped,
            f"skipped: {skipped}",
        )

        config = generated_config()
        pushes = [l for l in config.splitlines() if l.strip().startswith("push ")]
        check(
            "the healthy destination still has its push line",
            len(pushes) == len(rows) - 1,
            f"{len(pushes)} push line(s) for {len(rows) - 1} healthy destination(s)",
        )
    finally:
        client.table("destinations").update({"stream_key": original}).eq(
            "id", victim["id"]
        ).execute()
        regenerate_config(healthy["id"])


def scenario_5_key_hygiene() -> None:
    heading("5. Stream keys never leave the server")

    response = api_get("/api/destinations")
    if not check("list destinations", response.status_code == 200):
        return

    body = response.text
    rows = response.json()
    check(
        "no stream_key field in the response",
        all("stream_key" not in row for row in rows),
        "found stream_key in a destination row" if any("stream_key" in r for r in rows) else "",
    )
    check(
        "no ciphertext anywhere in the response body",
        "gAAAAA" not in body,
        "Fernet ciphertext (gAAAAA…) appears in the payload" if "gAAAAA" in body else "",
    )
    check(
        "has_stream_key is reported instead",
        all("has_stream_key" in row for row in rows),
    )


def main_cli() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", type=int, choices=range(1, 6), action="append")
    parser.add_argument(
        "--keep-feed",
        action="store_true",
        help="a feed is already publishing; don't start or stop one",
    )
    args = parser.parse_args()
    wanted = set(args.scenario or range(1, 6))

    try:
        httpx.get(f"{API}/api/stream/status", timeout=5)
    except Exception:
        sys.exit(
            f"Backend not reachable at {API}.\n"
            "  docker-compose -f test-env/docker-compose.yml up -d --build"
        )

    global _auth_headers
    _auth_headers = sign_in()

    # seed.py writes straight to the database, which the backend has no way to
    # notice — it only regenerates nginx.conf on startup and on API writes. Force
    # one now so the config matches the seeded destinations before anything is
    # asserted about it.
    rows = api_get("/api/destinations")
    if rows.status_code == 200 and rows.json():
        regenerate_config(rows.json()[0]["id"])
        time.sleep(2)

    feed = Feed(manage=not args.keep_feed)
    needs_feed = bool({1, 3} & wanted)

    try:
        if needs_feed:
            print("Starting the synthetic feed…")
            feed.start()
            time.sleep(5)

        if 1 in wanted:
            scenario_1_fanout(feed)
        if 2 in wanted:
            scenario_2_config()
        if 3 in wanted:
            scenario_3_deferred_reload(feed)
    finally:
        feed.stop()

    # These two run without a feed.
    if 4 in wanted:
        scenario_4_bad_key()
    if 5 in wanted:
        scenario_5_key_hygiene()

    print()
    if failures:
        print(f"{RED}{len(failures)} check(s) failed:{RESET}")
        for name in failures:
            print(f"  - {name}")
        return 1

    print(f"{GREEN}All checks passed.{RESET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main_cli())
