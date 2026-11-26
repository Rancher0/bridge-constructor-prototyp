#!/bin/bash
# Baut index-captain.html (alles inline: Three.js, Matter.js, Spielcode)
set -e
cd "$(dirname "$0")"
../node_modules/.bin/esbuild main.js --bundle --minify --format=iife --target=es2020 --legal-comments=none --outfile=/tmp/captain.bundle.js --log-level=warning
OUT=../index-captain.html
{
echo '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">'
echo '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">'
echo '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2214%22 fill=%22%230f2235%22/%3E%3Cpath d=%22M6 40h52M10 40l8-14 8 14 8-14 8 14 8-14 8 14M18 26h32%22 stroke=%22%23ffd43b%22 stroke-width=%224%22 fill=%22none%22 stroke-linejoin=%22round%22/%3E%3Crect x=%224%22 y=%2240%22 width=%2256%22 height=%225%22 fill=%22%23cfd8e3%22/%3E%3C/svg%3E">'
echo '<meta name="theme-color" content="#0f2235"><title>Brückenbauer 3D – Captain-Version</title>'
echo '<!-- Enthält three.js (MIT, © three.js authors) und matter-js 0.20.0 (MIT, © Liam Brummitt) -->'
echo '<style>'; cat style.css; echo '</style></head><body>'
cat body.html
echo '<script>'; cat /tmp/captain.bundle.js; echo '</script></body></html>'
} > $OUT
grep -c "</script" /tmp/captain.bundle.js || true
wc -c $OUT
