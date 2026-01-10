"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Project = {
  id: string;
  createdAt: string;
  previewPort: number | null;
  isRunning: boolean;
  lastCommit: string | null;
};

const API_BASE = "http://127.0.0.1:3030";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [message, setMessage] = useState("");
  const [chatStream, setChatStream] = useState<string[]>([]);
  const [visualEdit, setVisualEdit] = useState(false);
  const [selectedStudioId, setSelectedStudioId] = useState<string | null>(null);
  const logSourceRef = useRef<EventSource | null>(null);
  const chatSourceRef = useRef<EventSource | null>(null);

  const loadProjects = useCallback(async () => {
    const response = await fetch(`${API_BASE}/projects`);
    const data = (await response.json()) as Project[];
    setProjects(data);
    if (!selectedId && data.length) {
      setSelectedId(data[0].id);
    }
  }, [selectedId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId]
  );

  const previewUrl = useMemo(() => {
    if (!selectedProject?.previewPort) return null;
    const url = new URL(`http://127.0.0.1:${selectedProject.previewPort}`);
    if (visualEdit) {
      url.searchParams.set("studioEdit", "1");
    }
    return url.toString();
  }, [selectedProject?.previewPort, visualEdit]);

  const createProject = async () => {
    await fetch(`${API_BASE}/projects`, { method: "POST" });
    await loadProjects();
  };

  const startPreview = async () => {
    if (!selectedProject) return;
    await fetch(`${API_BASE}/projects/${selectedProject.id}/preview/start`, {
      method: "POST",
    });
    await loadProjects();
  };

  const stopPreview = async () => {
    if (!selectedProject) return;
    await fetch(`${API_BASE}/projects/${selectedProject.id}/preview/stop`, {
      method: "POST",
    });
    await loadProjects();
  };

  const sendChat = async () => {
    if (!selectedProject || !message.trim()) return;
    chatSourceRef.current?.close();
    setChatStream([]);
    const params = new URLSearchParams({
      message,
    });
    if (selectedStudioId) {
      params.set("mode", "guided");
      params.set("studioId", selectedStudioId);
    }
    const source = new EventSource(
      `${API_BASE}/projects/${selectedProject.id}/chat?${params.toString()}`
    );
    chatSourceRef.current = source;
    source.addEventListener("PLAN", (event) => {
      setChatStream((prev) => [...prev, `PLAN: ${(event as MessageEvent).data}`]);
    });
    source.addEventListener("PATCH", (event) => {
      setChatStream((prev) => [...prev, `PATCH: ${(event as MessageEvent).data}`]);
    });
    source.addEventListener("BUILD_OK", (event) => {
      setChatStream((prev) => [...prev, `BUILD_OK: ${(event as MessageEvent).data}`]);
    });
    source.addEventListener("ERROR", (event) => {
      setChatStream((prev) => [...prev, `ERROR: ${(event as MessageEvent).data}`]);
    });
    source.onerror = () => {
      source.close();
      loadProjects();
    };
  };

  useEffect(() => {
    return () => {
      chatSourceRef.current?.close();
      logSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    logSourceRef.current?.close();
    setLogs("");
    if (!selectedProject.isRunning) return;
    const source = new EventSource(`${API_BASE}/projects/${selectedProject.id}/logs`);
    logSourceRef.current = source;
    source.addEventListener("log", (event) => {
      const data = (event as MessageEvent).data as string;
      setLogs((prev) => prev + data);
    });
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [selectedProject]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "STUDIO_SELECT") {
        setSelectedStudioId(event.data.payload?.studioId ?? null);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const toggleVisualEdit = () => {
    setVisualEdit((prev) => !prev);
    const frame = document.getElementById("preview-frame") as HTMLIFrameElement | null;
    frame?.contentWindow?.postMessage(
      { type: "STUDIO_TOGGLE_EDIT_MODE" },
      "*"
    );
  };

  return (
    <div className="main-layout">
      <aside className="sidebar">
        <h2>Lovable Local Studio</h2>
        <button onClick={createProject}>New Project</button>
        <div className="projects-list">
          {projects.map((project) => (
            <button
              key={project.id}
              className={project.id === selectedId ? "secondary" : undefined}
              onClick={() => setSelectedId(project.id)}
            >
              {project.id}
            </button>
          ))}
        </div>
        <div className="badge">API: {API_BASE}</div>
      </aside>

      <main className="preview-area">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={startPreview} disabled={!selectedProject}>
            Run Preview
          </button>
          <button
            className="secondary"
            onClick={stopPreview}
            disabled={!selectedProject}
          >
            Stop
          </button>
          <button className="secondary" onClick={toggleVisualEdit}>
            {visualEdit ? "Disable Visual Edit" : "Enable Visual Edit"}
          </button>
          <span className="badge">
            {selectedProject?.isRunning
              ? `Running on ${selectedProject.previewPort}`
              : "Stopped"}
          </span>
        </div>
        <iframe
          id="preview-frame"
          className="preview-frame"
          src={previewUrl ?? "about:blank"}
          title="Preview"
        />
        <div>
          <h4>Logs</h4>
          <div className="log-box">{logs || "No logs yet."}</div>
        </div>
      </main>

      <aside className="panel">
        <h3>Chat & Visual Edits</h3>
        <div className="badge">
          Selected: {selectedStudioId ?? "none"}
        </div>
        <textarea
          rows={5}
          placeholder="Describe what to change..."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button onClick={sendChat} disabled={!selectedProject}>
          Send
        </button>
        <div className="log-box">
          {chatStream.length ? chatStream.join("\n") : "Chat output appears here."}
        </div>
      </aside>
    </div>
  );
}
