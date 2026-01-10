# Lovable Local Studio

Local-first studio for building apps with incremental patches, preview, and Visual Edits.

## Prerequisites
- Node.js 20+
- pnpm
- git
- Ollama with a coder-capable model

## Quick start
```bash
pnpm install
pnpm --filter studio-api dev
pnpm --filter studio-ui dev
```

Open:
- Studio UI: http://127.0.0.1:3000
- API: http://127.0.0.1:3030

## Templates
- `templates/vite-react-ts` is copied into `workspaces/<projectId>` when you create a project.

## Docs
- `docs/architecture.md`
- `docs/api.md`
- `docs/prompting.md`
