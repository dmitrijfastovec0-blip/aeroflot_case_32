#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

SERVER="root@31.76.110.113"
TARGET_DIR="/var/www/aeroflot"

echo "=== Building SVO OTO Aeroflot dashboard (Vite + TypeScript) ==="
npm run build

echo "=== Deploying dist to $SERVER:$TARGET_DIR ==="
ssh "$SERVER" "mkdir -p $TARGET_DIR"
rsync -avc --delete dist/ "${SERVER}:${TARGET_DIR}/"

echo ""
echo "=== Deploy Complete! ==="
echo "Application deployed to $TARGET_DIR on $SERVER"
