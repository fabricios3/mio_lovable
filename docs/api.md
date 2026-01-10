# Studio API

Base URL: `http://127.0.0.1:3030`

## Health
- `GET /health` ➜ `{ ok: true }`

## Projects
- `POST /projects` ➜ `{ id }`
- `GET /projects` ➜ `[{ id, createdAt, previewPort?, isRunning?, lastCommit? }]`
- `GET /projects/:id` ➜ `{ id, createdAt, previewPort?, isRunning?, lastCommit? }`

## Preview
- `POST /projects/:id/preview/start` ➜ `{ id, port, running }`
- `POST /projects/:id/preview/stop` ➜ `{ id, running }`

## Logs (SSE)
- `GET /projects/:id/logs`

## Chat / Patch (SSE)
- `GET /projects/:id/chat?message=...&mode=guided&studioId=...`
- `POST /projects/:id/chat` body: `{ message, mode?, studioId? }`

Events:
- `PLAN`, `PATCH`, `APPLY_OK`, `BUILD_OK`, `BUILD_FAIL`, `COMMIT_OK`, `ERROR`
