#!/usr/bin/env bash
set -euo pipefail

public_url="${1:-https://card.xinyingst.com}"

echo "Checking independent service boundary..."
systemctl is-active --quiet project-card-tool.service
ss -ltn | grep -qE '127\.0\.0\.1:8773\b'

echo "Checking local readiness..."
curl --silent --show-error --fail http://127.0.0.1:8773/api/ready
echo

echo "Checking public readiness..."
curl --silent --show-error --fail "${public_url%/}/api/ready"
echo

echo "Checking Nginx configuration..."
nginx -t

echo "Production verification passed."
