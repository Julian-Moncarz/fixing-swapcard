#!/usr/bin/env bash
# Zips the extension (manifest + src) into dist/calmercard.zip for the Chrome Web Store.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/calmercard.zip
zip -qr dist/calmercard.zip manifest.json src -x '*.DS_Store'
echo "dist/calmercard.zip"
