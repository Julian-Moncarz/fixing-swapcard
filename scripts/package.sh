#!/usr/bin/env bash
# Builds two zips in dist/:
#   calmercard.zip        files inside a calmercard/ folder: unzip, then "Load unpacked" that folder
#   calmercard-store.zip  files at the zip root, as the Chrome Web Store requires
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/calmercard.zip dist/calmercard-store.zip
rm -rf dist/calmercard && mkdir -p dist/calmercard
cp -R manifest.json src icons LICENSE PRIVACY.md dist/calmercard/
(cd dist && zip -qr calmercard.zip calmercard -x '*.DS_Store')
(cd dist/calmercard && zip -qr ../calmercard-store.zip . -x '*.DS_Store')
rm -rf dist/calmercard
echo "dist/calmercard.zip dist/calmercard-store.zip"
