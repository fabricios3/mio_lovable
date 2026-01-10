import Fastify from "fastify";
import cors from "@fastify/cors";
import sse from "@fastify/sse-v2";
import { nanoid } from "nanoid";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

const API_PORT = Number(process.env.STUDIO_API_PORT ?? 3030);
const ROOT_DIR = path.resolve(process.cwd(), "..", "..");
const WORKSPACES_DIR = path.join(ROOT_DIR, "workspaces");
const TEMPLATE_DIR = path.join(ROOT_DIR, "templates", "vite-react-ts");
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:14b";

const fastify = Fastify({ logger: true });
const logBus = new EventEmitter();

const runningPreviews = new Map<
  string,
  { process: ReturnType<typeof spawn>; port: number; buffer: string[] }
>();

const studioMetaFile = (projectId: string) =>
  path.join(WORKSPACES_DIR, projectId, ".studio.json");

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const readJson = async <T,>(filePath: string, fallback: T): Promise<T> => {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
};

const writeJson = async (filePath: string, data: unknown) => {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
};

const listProjectIds = async () => {
  await ensureDir(WORKSPACES_DIR);
  const entries = await fs.readdir(WORKSPACES_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
};

const loadProjectMeta = async (projectId: string) =>
  readJson(studioMetaFile(projectId), {
    id: projectId,
    createdAt: new Date().toISOString(),
    previewPort: null as number | null,
    lastCommit: null as string | null,
  });

const saveProjectMeta = async (projectId: string, meta: any) =>
  writeJson(studioMetaFile(projectId), meta);

const allocatePort = async () => {
  const ids = await listProjectIds();
  const ports = await Promise.all(
    ids.map(async (id) => {
      const meta = await loadProjectMeta(id);
      return meta.previewPort ?? null;
    })
  );
  const used = new Set(ports.filter(Boolean));
  let port = 4173;
  while (used.has(port)) {
    port += 1;
  }
  return port;
};

const runCommand = async (
  command: string,
  args: string[],
  cwd: string
): Promise<{ code: number; output: string }>
  =>
    new Promise((resolve) => {
      const child = spawn(command, args, { cwd, shell: true });
      let output = "";
      child.stdout.on("data", (data) => {
        output += data.toString();
      });
      child.stderr.on("data", (data) => {
        output += data.toString();
      });
      child.on("close", (code) => resolve({ code: code ?? 1, output }));
    });

const gitCommit = async (projectId: string, message: string) => {
  const projectDir = path.join(WORKSPACES_DIR, projectId);
  await runCommand("git", ["add", "-A"], projectDir);
  const result = await runCommand("git", ["commit", "-m", message], projectDir);
  return result;
};

const validatePatchPaths = (patch: string) => {
  const lines = patch.split("\n");
  for (const line of lines) {
    if (line.startsWith("+++ b/") || line.startsWith("--- a/")) {
      const target = line.replace(/^\+\+\+ b\//, "").replace(/^--- a\//, "");
      if (
        target.startsWith("/") ||
        target.includes("..") ||
        target.includes("\\")
      ) {
        throw new Error(`Invalid patch path: ${target}`);
      }
    }
  }
};

const applyPatch = async (projectId: string, patch: string) => {
  validatePatchPaths(patch);
  const projectDir = path.join(WORKSPACES_DIR, projectId);
  const patchFile = path.join(projectDir, ".studio.patch");
  await fs.writeFile(patchFile, patch, "utf-8");
  const result = await runCommand("git", ["apply", patchFile], projectDir);
  await fs.unlink(patchFile).catch(() => undefined);
  if (result.code !== 0) {
    throw new Error(result.output || "Failed to apply patch");
  }
};

const collectContext = async (projectId: string) => {
  const projectDir = path.join(WORKSPACES_DIR, projectId);
  const files = [
    "src/App.tsx",
    "src/main.tsx",
    "vite.config.ts",
    "package.json",
  ];
  const snippets = await Promise.all(
    files.map(async (file) => {
      const fullPath = path.join(projectDir, file);
      try {
        const content = await fs.readFile(fullPath, "utf-8");
        return `\n--- ${file}\n${content}\n`;
      } catch {
        return "";
      }
    })
  );
  return snippets.join("\n");
};

const callOllama = async (messages: { role: string; content: string }[]) => {
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error: ${response.status} ${text}`);
  }
  const data = (await response.json()) as { message: { content: string } };
  return data.message.content;
};

const extractDiff = (response: string) => {
  const diffIndex = response.indexOf("diff --git");
  if (diffIndex === -1) {
    throw new Error("No diff found in model response");
  }
  return response.slice(diffIndex).trim();
};

fastify.register(cors, { origin: true });
fastify.register(sse);

fastify.get("/health", async () => ({ ok: true }));

fastify.get("/projects", async () => {
  const ids = await listProjectIds();
  const projects = await Promise.all(
    ids.map(async (id) => {
      const meta = await loadProjectMeta(id);
      const running = runningPreviews.has(id);
      return {
        id,
        createdAt: meta.createdAt,
        previewPort: meta.previewPort,
        isRunning: running,
        lastCommit: meta.lastCommit ?? null,
      };
    })
  );
  return projects;
});

fastify.post("/projects", async () => {
  await ensureDir(WORKSPACES_DIR);
  const id = nanoid(8);
  const targetDir = path.join(WORKSPACES_DIR, id);
  await fs.cp(TEMPLATE_DIR, targetDir, { recursive: true });
  await runCommand("git", ["init"], targetDir);
  await runCommand("git", ["add", "-A"], targetDir);
  await runCommand("git", ["commit", "-m", "init template"], targetDir);
  const port = await allocatePort();
  const meta = {
    id,
    createdAt: new Date().toISOString(),
    previewPort: port,
    lastCommit: "init template",
  };
  await saveProjectMeta(id, meta);
  return { id };
});

fastify.get("/projects/:id", async (request) => {
  const { id } = request.params as { id: string };
  const meta = await loadProjectMeta(id);
  return {
    id,
    createdAt: meta.createdAt,
    previewPort: meta.previewPort,
    isRunning: runningPreviews.has(id),
    lastCommit: meta.lastCommit ?? null,
  };
});

fastify.post("/projects/:id/preview/start", async (request) => {
  const { id } = request.params as { id: string };
  const meta = await loadProjectMeta(id);
  const projectDir = path.join(WORKSPACES_DIR, id);
  if (runningPreviews.has(id)) {
    return { id, port: meta.previewPort, running: true };
  }
  const port = meta.previewPort ?? (await allocatePort());
  meta.previewPort = port;
  await saveProjectMeta(id, meta);
  const child = spawn("pnpm", ["dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: projectDir,
    shell: true,
    env: { ...process.env, PORT: String(port) },
  });
  const buffer: string[] = [];
  const pushLog = (line: string) => {
    buffer.push(line);
    if (buffer.length > 200) buffer.shift();
    logBus.emit(`log:${id}`, line);
  };
  child.stdout.on("data", (data) => pushLog(data.toString()));
  child.stderr.on("data", (data) => pushLog(data.toString()));
  child.on("close", () => {
    runningPreviews.delete(id);
    logBus.emit(`log:${id}`, "\n[preview stopped]\n");
  });
  runningPreviews.set(id, { process: child, port, buffer });
  return { id, port, running: true };
});

fastify.post("/projects/:id/preview/stop", async (request) => {
  const { id } = request.params as { id: string };
  const running = runningPreviews.get(id);
  if (running) {
    running.process.kill();
    runningPreviews.delete(id);
  }
  return { id, running: false };
});

fastify.get("/projects/:id/logs", async (request, reply) => {
  const { id } = request.params as { id: string };
  const running = runningPreviews.get(id);
  const buffer = running?.buffer ?? [];
  reply.sse((async function* () {
    if (buffer.length) {
      yield { event: "log", data: buffer.join("") };
    }
    const handler = (line: string) => {
      reply.sse({ event: "log", data: line });
    };
    logBus.on(`log:${id}`, handler);
    try {
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      logBus.off(`log:${id}`, handler);
    }
  })());
});

const handleChat = async (
  request: any,
  reply: any,
  body: { message: string; mode?: string; studioId?: string }
) => {
  const { id } = request.params as { id: string };
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    if (!body.message?.trim()) {
      send("ERROR", { message: "Message is required." });
      reply.raw.end();
      return;
    }
    const context = await collectContext(id);
    const mode = body.mode ?? "normal";
    const systemPrompt = `You are an engineering assistant working inside an existing template.\nReturn a short plan (files to touch) then a unified diff. Never output full files.`;
    const userPrompt = `Project context:\n${context}\n\nUser request: ${body.message}\nMode: ${mode}\nStudio ID: ${body.studioId ?? ""}\nReturn plan and unified diff only.`;
    send("PLAN", { status: "requesting" });
    const response = await callOllama([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    send("PLAN", { status: "received", content: response.split("diff --git")[0]?.trim() });
    const diff = extractDiff(response);
    send("PATCH", { diff });
    await applyPatch(id, diff);
    send("APPLY_OK", { ok: true });

    const projectDir = path.join(WORKSPACES_DIR, id);
    const buildResult = await runCommand("pnpm", ["run", "build"], projectDir);
    if (buildResult.code !== 0) {
      send("BUILD_FAIL", { output: buildResult.output });
      reply.raw.end();
      return;
    }
    send("BUILD_OK", { output: buildResult.output });
    const commit = await gitCommit(id, body.message.slice(0, 64));
    const meta = await loadProjectMeta(id);
    meta.lastCommit = body.message.slice(0, 64);
    await saveProjectMeta(id, meta);
    send("COMMIT_OK", { output: commit.output });
    reply.raw.end();
  } catch (error) {
    send("ERROR", { message: (error as Error).message });
    reply.raw.end();
  }
};

fastify.get("/projects/:id/chat", async (request, reply) => {
  const query = request.query as { message?: string; mode?: string; studioId?: string };
  const body = {
    message: query.message ?? "",
    mode: query.mode,
    studioId: query.studioId,
  };
  return handleChat(request, reply, body);
});

fastify.post("/projects/:id/chat", async (request, reply) => {
  const body = request.body as { message: string; mode?: string; studioId?: string };
  return handleChat(request, reply, body);
});

const start = async () => {
  await ensureDir(WORKSPACES_DIR);
  await fastify.listen({ port: API_PORT, host: "127.0.0.1" });
};

start().catch((error) => {
  fastify.log.error(error);
  process.exit(1);
});
