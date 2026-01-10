Write-Host "Lovable Local Studio setup (Windows)"
Write-Host "Prereqs: Node.js 20+, pnpm, git, Ollama installed"

pnpm install

Write-Host "Start API (http://127.0.0.1:3030)"
Write-Host "  pnpm --filter studio-api dev"
Write-Host "Start UI (http://127.0.0.1:3000)"
Write-Host "  pnpm --filter studio-ui dev"
