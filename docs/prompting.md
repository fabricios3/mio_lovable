# Prompting Rules

## System prompt (internal)
- You are an engineering assistant working inside an existing template.
- Always return:
  1. Short plan (files to modify)
  2. Unified diff patch
- Never output full files.
- Keep changes minimal and incremental.
- Do not access files outside the workspace.

## Patch protocol
Unified diff format with `diff --git` headers. The API validates paths and applies patches with `git apply`.

## Build loop
After applying a patch:
1. Run `pnpm run build` in the workspace.
2. If the build fails, return logs to the model and ask for a minimal fix.
3. On success, commit a git checkpoint.
