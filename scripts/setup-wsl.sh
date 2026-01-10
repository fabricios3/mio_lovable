#!/usr/bin/env bash
set -euo pipefail

echo "Lovable Local Studio setup (WSL/Linux)"
echo "Prereqs: Node.js 20+, pnpm, git, Ollama installed"

pnpm install

echo "Start API (http://127.0.0.1:3030)"
echo "  pnpm --filter studio-api dev"
echo "Start UI (http://127.0.0.1:3000)"
echo "  pnpm --filter studio-ui dev"
