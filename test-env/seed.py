"""Load test destinations into the staging Supabase project.

    python test-env/seed.py                 # local mode: point at the fake sinks
    python test-env/seed.py --mode real     # point at real YouTube/Facebook
    python test-env/seed.py --clear         # remove everything and stop

Writes directly with the service key, bypassing the API's auth layer, so the
harness needs no login. It refuses to run against anything but the staging
project configured in test-env/.env — see the guard in load_config().

Real mode reads test-env/real-destinations.local.json (gitignored):

    [
      {"name": "YouTube",  "rtmp_url": "rtmp://a.rtmp.youtube.com/live2",
       "platform_type": "youtube",  "stream_key": "xxxx-xxxx-xxxx-xxxx"},
      {"name": "Facebook", "rtmp_url": "rtmps://live-api-s.facebook.com:443/rtmp",
       "platform_type": "facebook", "stream_key": "FB-xxxxx"}
    ]
"""

import argparse
import json
import os
import sys
from pathlib import Path

TEST_ENV = Path(__file__).resolve().parent
REPO = TEST_ENV.parent
sys.path.insert(0, str(REPO / "backend"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(TEST_ENV / ".env")

import main  # noqa: E402  (reads config at import, so load_dotenv comes first)
from supabase import create_client  # noqa: E402

REAL_DESTINATIONS = TEST_ENV / "real-destinations.local.json"

# Sinks are reachable from the server container by service name. The application
# name is chosen to match what each platform really uses, so a mistake in URL
# joining shows up here rather than on Sunday.
LOCAL_DESTINATIONS = [
    {
        "name": "YouTube (sink)",
        "rtmp_url": "rtmp://sink-youtube:1935/live2",
        "platform_type": "youtube",
        "stream_key": "yt-test-key-0001",
    },
    {
        "name": "Facebook (sink)",
        "rtmp_url": "rtmp://sink-facebook:1935/rtmp",
        "platform_type": "facebook",
        "stream_key": "fb-test-key-0002",
    },
]


def load_config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY", "")
    if not url or not key:
        sys.exit(
            "SUPABASE_URL and SUPABASE_KEY must be set in test-env/.env.\n"
            "Copy test-env/.env.example and point it at your STAGING project."
        )
    if not os.getenv("ENCRYPTION_KEY"):
        sys.exit("ENCRYPTION_KEY must be set in test-env/.env.")

    # Guard against pointing the harness at production by accident. This script
    # deletes every destination it finds, and the bad-key scenario deliberately
    # corrupts rows — neither is survivable on the real project.
    if os.getenv("I_KNOW_THIS_IS_STAGING") != "yes":
        sys.exit(
            "Refusing to run without I_KNOW_THIS_IS_STAGING=yes in test-env/.env.\n"
            "This script deletes all destinations in the target project. Point it\n"
            "at a staging Supabase project, never the one your services use."
        )
    return url, key


def destinations_from_file() -> list[dict]:
    if not REAL_DESTINATIONS.exists():
        sys.exit(
            f"--mode real needs {REAL_DESTINATIONS.name}.\n"
            "Create it next to this script; see the docstring for the format.\n"
            "It is gitignored — real stream keys must never be committed."
        )
    entries = json.loads(REAL_DESTINATIONS.read_text())
    for entry in entries:
        missing = {"name", "rtmp_url", "stream_key", "platform_type"} - entry.keys()
        if missing:
            sys.exit(f"{REAL_DESTINATIONS.name}: entry {entry.get('name')!r} missing {missing}")
    return entries


def main_cli() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("local", "real"), default="local")
    parser.add_argument("--clear", action="store_true", help="delete all destinations and exit")
    args = parser.parse_args()

    url, key = load_config()
    client = create_client(url, key)

    existing = client.table("destinations").select("id,name").execute().data or []
    for row in existing:
        client.table("destinations").delete().eq("id", row["id"]).execute()
    if existing:
        print(f"cleared {len(existing)} existing destination(s)")

    if args.clear:
        return 0

    entries = LOCAL_DESTINATIONS if args.mode == "local" else destinations_from_file()

    for entry in entries:
        row = dict(entry)
        # Encrypt with the same helper the API uses, so the stored shape is
        # byte-for-byte what a real create would produce.
        row["stream_key"] = main.encrypt_stream_key(row["stream_key"])
        row["enabled"] = True
        client.table("destinations").insert(row).execute()
        print(f"seeded {entry['name']:<20} -> {entry['rtmp_url']}")

    print(f"\n{len(entries)} destination(s) seeded in {args.mode} mode.")
    if args.mode == "local":
        print("Restart or wait ~5s for the backend to regenerate nginx.conf, then:")
        print("  ./test-env/stream.sh   &&   python test-env/verify.py")
    else:
        print("Real platforms: verify.py can only confirm the pushes were configured")
        print("and the origin went live — check the platform dashboards yourself.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main_cli())
