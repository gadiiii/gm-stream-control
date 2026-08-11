import os
import sys
from pathlib import Path

from cryptography.fernet import Fernet

# main.py reads its config at import time, so the key has to exist first.
os.environ.setdefault("ENCRYPTION_KEY", Fernet.generate_key().decode())

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
