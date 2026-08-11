"""Verify the staging environment is ready. Read-only — changes nothing.

    python test-env/check-setup.py

Run this after filling in test-env/.env and before seed.py. Every failure says
what to do about it.
"""

import os
import sys
from pathlib import Path

TEST_ENV = Path(__file__).resolve().parent
REPO = TEST_ENV.parent
sys.path.insert(0, str(REPO / "backend"))

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"

problems: list[str] = []


def ok(label: str, detail: str = "") -> None:
    print(f"  [{GREEN}PASS{RESET}] {label}")
    if detail:
        print(f"         {DIM}{detail}{RESET}")


def fail(label: str, fix: str) -> None:
    print(f"  [{RED}FAIL{RESET}] {label}")
    print(f"         {YELLOW}{fix}{RESET}")
    problems.append(label)


def warn(label: str, detail: str) -> None:
    print(f"  [{YELLOW}WARN{RESET}] {label}")
    print(f"         {detail}")


def main() -> int:
    env_file = TEST_ENV / ".env"
    print("\nStaging environment check\n" + "=" * 25 + "\n")

    if not env_file.exists():
        fail(
            "test-env/.env exists",
            "cp test-env/.env.example test-env/.env    then fill it in",
        )
        print(f"\n{RED}Stopped — nothing else can be checked without it.{RESET}\n")
        return 1
    ok("test-env/.env exists")

    from dotenv import load_dotenv

    load_dotenv(env_file)

    # ── Required values ──────────────────────────────────────────────────────
    required = {
        "SUPABASE_URL": "Project URL from Settings → Data API",
        "SUPABASE_KEY": "service_role secret from Settings → API Keys",
        "ENCRYPTION_KEY": 'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"',
        "SUPABASE_TEST_EMAIL": "the user you created in Authentication → Users",
        "SUPABASE_TEST_PASSWORD": "that user's password",
    }
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        for name in missing:
            fail(f"{name} is set", required[name])
    else:
        ok("all required values are set")

    if os.getenv("I_KNOW_THIS_IS_STAGING") != "yes":
        fail(
            "I_KNOW_THIS_IS_STAGING=yes",
            "seed.py deletes every destination in the target project — set this to confirm "
            "you are pointing at staging, not the project your services use.",
        )

    if missing:
        print(f"\n{RED}Stopped — fill in the values above first.{RESET}\n")
        return 1

    # ── Encryption key ───────────────────────────────────────────────────────
    from cryptography.fernet import Fernet

    try:
        Fernet(os.environ["ENCRYPTION_KEY"].encode())
        ok("ENCRYPTION_KEY is a valid Fernet key")
    except Exception:
        fail(
            "ENCRYPTION_KEY is a valid Fernet key",
            'Regenerate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"',
        )
        return 1

    prod_env = REPO / "backend" / ".env"
    if prod_env.exists():
        prod_key = next(
            (
                line.split("=", 1)[1].strip()
                for line in prod_env.read_text().splitlines()
                if line.startswith("ENCRYPTION_KEY=")
            ),
            "",
        )
        if prod_key and prod_key == os.environ["ENCRYPTION_KEY"]:
            warn(
                "staging uses the same ENCRYPTION_KEY as backend/.env",
                "Not fatal, but a separate key is safer — it guarantees a staging key can "
                "never decrypt a real one.",
            )

    # ── Supabase connection ──────────────────────────────────────────────────
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    if url == "https://your-staging-project.supabase.co":
        fail("SUPABASE_URL is your real staging project", "Still set to the example value.")
        return 1

    try:
        client = create_client(url, os.environ["SUPABASE_KEY"])
        ok("Supabase client created", url)
    except Exception as exc:
        fail("Supabase client created", f"{exc}")
        return 1

    # ── Schema ───────────────────────────────────────────────────────────────
    tables = ["destinations", "streams", "stream_destinations", "stream_analytics", "team_members"]
    missing_tables = []
    for table in tables:
        try:
            client.table(table).select("*").limit(1).execute()
        except Exception as exc:
            message = str(exc)
            if "does not exist" in message or "PGRST205" in message or "42P01" in message:
                missing_tables.append(table)
            elif "Invalid API key" in message or "JWT" in message:
                fail(
                    "SUPABASE_KEY is accepted",
                    "That key was rejected. Use the service_role secret (Settings → API Keys), "
                    "not the anon/publishable key.",
                )
                return 1
            else:
                fail(f"table {table!r} is readable", message[:160])

    if missing_tables:
        fail(
            f"schema applied (missing: {', '.join(missing_tables)})",
            "Open the project's SQL editor and run "
            "backend/supabase/migrations/001_initial_schema.sql",
        )
    else:
        ok("schema applied", f"all {len(tables)} tables present")

    # ── Is this actually staging? ────────────────────────────────────────────
    # seed.py deletes everything here, so make some noise if the project looks
    # like it holds real data.
    try:
        rows = client.table("destinations").select("name,rtmp_url").execute().data or []
        streams = client.table("streams").select("id").limit(25).execute().data or []
        real_looking = [
            r for r in rows
            if any(host in (r.get("rtmp_url") or "") for host in ("youtube.com", "facebook.com"))
        ]
        if real_looking or len(streams) > 5:
            warn(
                "this project may not be staging",
                f"Found {len(rows)} destination(s) "
                f"({len(real_looking)} pointing at real platforms) and {len(streams)} stream "
                "record(s). seed.py DELETES every destination here. Make sure this is not the "
                "project your services use.",
            )
        else:
            ok("project looks like a clean staging project")
    except Exception:
        pass

    # ── Auth ─────────────────────────────────────────────────────────────────
    try:
        session = client.auth.sign_in_with_password(
            {
                "email": os.environ["SUPABASE_TEST_EMAIL"],
                "password": os.environ["SUPABASE_TEST_PASSWORD"],
            }
        )
        if session and session.session:
            ok("test user can sign in", os.environ["SUPABASE_TEST_EMAIL"])
        else:
            fail("test user can sign in", "Supabase returned no session.")
    except Exception as exc:
        message = str(exc)
        hint = (
            "Create the user under Authentication → Users, and tick "
            "'Auto Confirm User' — an unconfirmed user cannot sign in."
            if "confirm" in message.lower() or "credential" in message.lower()
            else message[:160]
        )
        fail("test user can sign in", hint)

    # ── Result ───────────────────────────────────────────────────────────────
    print()
    if problems:
        print(f"{RED}{len(problems)} problem(s) to fix:{RESET}")
        for name in problems:
            print(f"  - {name}")
        print()
        return 1

    print(f"{GREEN}Staging is ready.{RESET}\n")
    print("Next:")
    print("  docker-compose -f test-env/docker-compose.yml up -d --build")
    print("  python test-env/seed.py")
    print("  python test-env/verify.py\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
