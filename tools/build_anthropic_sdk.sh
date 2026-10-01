#!/bin/sh
# js/vendor/anthropic-sdk.mjs 다시 만들기 (공식 Claude SDK를 브라우저에서 쓰도록 한 파일로 묶음)
# 사용: sh tools/build_anthropic_sdk.sh [버전]
set -e
VER=${1:-0.131.0}
DIR=$(mktemp -d)
cd "$DIR"
npm init -y >/dev/null
npm i -q "@anthropic-ai/sdk@$VER" esbuild
echo "export { default } from '@anthropic-ai/sdk';" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --minify --legal-comments=eof --outfile=out.mjs
cd - >/dev/null
{ echo "/* @anthropic-ai/sdk $VER (MIT) — 브라우저용 묶음. 다시 만들기: tools/build_anthropic_sdk.sh */"; cat "$DIR/out.mjs"; } > js/vendor/anthropic-sdk.mjs
rm -rf "$DIR"
echo "js/vendor/anthropic-sdk.mjs 갱신 완료 ($VER)"
