#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

release_id="${1:-}"
if [[ -z "${release_id}" || ! "${release_id}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Usage: rollback-release.sh <release-id>"
  exit 1
fi

target="/opt/project-card-tool/releases/${release_id}"
if [[ ! -f "${target}/server.js" ]]; then
  echo "Valid release not found: ${target}"
  exit 1
fi

node --check "${target}/server.js"
ln -sfn "${target}" /opt/project-card-tool/current
chown -h root:root /opt/project-card-tool/current
systemctl restart project-card-tool.service

for _ in {1..20}; do
  if curl --silent --fail http://127.0.0.1:8773/api/ready >/dev/null; then
    echo "Rolled back to ${release_id}."
    exit 0
  fi
  sleep 1
done

systemctl status project-card-tool.service --no-pager || true
echo "Rollback target did not become ready."
exit 1
