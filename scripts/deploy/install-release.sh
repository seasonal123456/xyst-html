#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

archive_path="${1:-}"
release_id="${2:-}"

if [[ -z "${archive_path}" || -z "${release_id}" ]]; then
  echo "Usage: install-release.sh <release.zip> <release-id>"
  exit 1
fi

if [[ ! -f "${archive_path}" ]]; then
  echo "Release archive not found: ${archive_path}"
  exit 1
fi

if [[ ! "${release_id}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Release id may only contain letters, numbers, dot, underscore and dash."
  exit 1
fi

release_dir="/opt/project-card-tool/releases/${release_id}"
env_file="/etc/project-card-tool/project-card-tool.env"
unit_file="/etc/systemd/system/project-card-tool.service"
previous_release=""

if [[ -L /opt/project-card-tool/current ]]; then
  previous_release="$(readlink -f /opt/project-card-tool/current || true)"
fi

if ss -ltn | grep -qE '127\.0\.0\.1:8773\b' && ! systemctl is-active --quiet project-card-tool.service; then
  echo "Port 8773 is already used by another service. Deployment stopped."
  exit 1
fi

if ! id projectcard >/dev/null 2>&1; then
  useradd --system --home /var/lib/project-card-tool --shell /usr/sbin/nologin projectcard
fi

install -d -o root -g root -m 0755 /opt/project-card-tool/releases
install -d -o root -g projectcard -m 0750 /etc/project-card-tool
install -d -o projectcard -g projectcard -m 0750 /var/lib/project-card-tool
install -d -o projectcard -g projectcard -m 0750 /var/lib/project-card-tool/generated
install -d -o projectcard -g projectcard -m 0750 /var/lib/project-card-tool/tmp
install -d -o projectcard -g projectcard -m 0750 /var/log/project-card-tool
if [[ ! -e "${release_dir}" ]]; then
  install -d -o root -g root -m 0755 "${release_dir}"
  unzip -q "${archive_path}" -d "${release_dir}"
fi

if [[ ! -f "${release_dir}/server.js" || ! -f "${release_dir}/deploy/project-card-tool.service" ]]; then
  echo "Release archive has an unexpected layout. Deployment stopped before switching current."
  exit 1
fi

node --check "${release_dir}/server.js"

if [[ ! -f "${env_file}" ]]; then
  install -o root -g projectcard -m 0640 "${release_dir}/deploy/project-card-tool.env.example" "${env_file}"
  echo "Environment template created at ${env_file}. Fill the three REPLACE_ON_SERVER values, then rerun this script."
  exit 2
fi

if grep -q 'REPLACE_ON_SERVER' "${env_file}"; then
  echo "Environment file still contains REPLACE_ON_SERVER. Deployment stopped."
  exit 2
fi

install -o root -g root -m 0644 "${release_dir}/deploy/project-card-tool.service" "${unit_file}"
ln -sfn "${release_dir}" /opt/project-card-tool/current
chown -h root:root /opt/project-card-tool/current

systemctl daemon-reload
systemctl enable project-card-tool.service
systemctl restart project-card-tool.service

for _ in {1..20}; do
  if curl --silent --fail http://127.0.0.1:8773/api/ready >/dev/null; then
    echo "Project Card Tool release ${release_id} is ready on 127.0.0.1:8773."
    exit 0
  fi
  sleep 1
done

systemctl status project-card-tool.service --no-pager || true
journalctl -u project-card-tool.service -n 80 --no-pager || true
if [[ -n "${previous_release}" && -d "${previous_release}" ]]; then
  ln -sfn "${previous_release}" /opt/project-card-tool/current
  chown -h root:root /opt/project-card-tool/current
  systemctl restart project-card-tool.service || true
  echo "Service did not become ready. Rolled current back to ${previous_release}."
else
  echo "Service did not become ready. No previous release was available for automatic rollback."
fi
exit 1
