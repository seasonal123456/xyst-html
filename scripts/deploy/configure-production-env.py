#!/usr/bin/env python3
import argparse
import grp
import json
import os
from pathlib import Path
import pwd
import secrets
import sys
from urllib.parse import urlparse


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(1)


parser = argparse.ArgumentParser(description="Configure the project-card production env without printing secrets.")
parser.add_argument("--env-file", default="/etc/project-card-tool/project-card-tool.env")
args = parser.parse_args()

try:
    payload = json.load(sys.stdin)
except (json.JSONDecodeError, UnicodeDecodeError):
    fail("Expected a JSON object on stdin.")

api_base = str(payload.get("apiBase") or "").strip().rstrip("/")
api_key = str(payload.get("apiKey") or "").strip()
parsed = urlparse(api_base)
if parsed.scheme != "https" or not parsed.netloc:
    fail("apiBase must be a valid HTTPS URL.")
if not api_key:
    fail("apiKey is required.")

env_path = Path(args.env_file)
text = env_path.read_text(encoding="utf-8")
if text.count("REPLACE_ON_SERVER") != 3:
    fail("Environment template is not in the expected unconfigured state.")

values = (secrets.token_hex(48), api_base, api_key)
for value in values:
    text = text.replace("REPLACE_ON_SERVER", value, 1)

tmp_path = env_path.with_name(f".{env_path.name}.{os.getpid()}.tmp")
tmp_path.write_text(text, encoding="utf-8", newline="\n")
os.chmod(tmp_path, 0o640)
os.chown(tmp_path, pwd.getpwnam("root").pw_uid, grp.getgrnam("projectcard").gr_gid)
os.replace(tmp_path, env_path)
print("Production environment configured without printing secret values.")
