"""Report destinations whose stored stream key looks wrong. Read-only.

Two failure modes are possible in existing data:

  * The key cannot be decrypted at all — usually a row written under a
    different ENCRYPTION_KEY. nginx skips these destinations entirely.
  * The key decrypts, but the *result* is itself decryptable ciphertext. These
    were double-encrypted before the fix in fd403c3: nothing errors, a garbage
    key is pushed to the platform, and the destination silently fails. This is
    the one that is hard to spot from the UI.

Nothing is modified. Fix a flagged destination by re-entering its key in the
control panel.

    cd backend && python scripts/audit_stream_keys.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import get_fernet, get_supabase  # noqa: E402

# Platform keys are ASCII and short. Fernet ciphertext is ~100+ chars of
# base64 starting with the version byte 0x80, which encodes as "gAAAAA".
CIPHERTEXT_PREFIX = "gAAAAA"


def looks_like_ciphertext(value: str) -> bool:
    if value.startswith(CIPHERTEXT_PREFIX):
        return True
    try:
        get_fernet().decrypt(value.encode())
    except Exception:
        return False
    return True


def main() -> int:
    rows = get_supabase().table("destinations").select("*").execute().data or []
    if not rows:
        print("No destinations found.")
        return 0

    problems = []
    for row in rows:
        name = row.get("name") or row.get("id")
        enabled = row.get("enabled")
        try:
            key = get_fernet().decrypt((row.get("stream_key") or "").encode()).decode()
        except Exception:
            problems.append((name, enabled, "key cannot be decrypted at all"))
            continue

        if looks_like_ciphertext(key):
            problems.append((name, enabled, "double-encrypted — decrypts to more ciphertext"))
        elif not key.strip():
            problems.append((name, enabled, "key is empty"))
        elif not key.isascii():
            problems.append((name, enabled, "key contains non-ASCII characters"))

    print(f"Checked {len(rows)} destination(s).\n")
    if not problems:
        print("All stream keys decrypt to plausible plaintext.")
        return 0

    for name, enabled, reason in problems:
        state = "enabled" if enabled else "disabled"
        print(f"  BAD  {name}  ({state}) — {reason}")
    print(f"\n{len(problems)} destination(s) need their stream key re-entered in the control panel.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
