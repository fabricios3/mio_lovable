# Lovable Local Studio — Architecture

## Overview
The repo is a monorepo using pnpm workspaces + Turbo. It contains:

- `apps/studio-api`: Fastify orchestration API for projects, previews, chat/patch flow, and git checkpoints.
- `apps/studio-ui`: Next.js App Router UI for managing projects, preview, logs, chat, and Visual Edit selection.
- `templates/vite-react-ts`: Vite React TypeScript template with Visual Edit instrumentation and studio tagger plugin.
- `workspaces/`: Generated projects (each has its own git history).

## Data flow
1. **New Project** ➜ API copies template into `workspaces/<id>` and initializes git.
2. **Preview** ➜ API spawns `pnpm dev` for the workspace and streams logs.
3. **Chat** ➜ API requests plan+diff from Ollama, applies patch, runs build, commits checkpoint.
4. **Visual Edit** ➜ Template emits `STUDIO_SELECT` with `data-studio-id` to the Studio UI, which then calls API in guided mode.

## Visual Edit tagging
The Vite plugin injects `data-studio-id` into JSX elements and writes `studio-map.json` for resolving IDs back to source file/line.

## Observability
Preview logs are exposed via SSE (`/projects/:id/logs`) and displayed in Studio UI.
