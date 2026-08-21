"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Scissors,
  Play,
  Download,
  Trash2,
  RefreshCw,
  Upload,
  Film,
  Clock,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FolderOpen,
} from "lucide-react";

const AUTOCLIP_API = "http://localhost:8050";

type Project = {
  id: string;
  name: string;
  status: "pending" | "downloading" | "processing" | "completed" | "error";
  source_type: "youtube" | "bilibili" | "upload";
  source_url?: string;
  clips_count: number;
  created_at: string;
  updated_at: string;
};

type Clip = {
  id: string;
  project_id: string;
  title: string;
  start_time: number;
  end_time: number;
  score: number;
  video_path?: string;
  thumbnail_path?: string;
};

export default function AutoClipPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProject, setNewProject] = useState({
    source_type: "youtube" as "youtube" | "bilibili" | "upload",
    source_url: "",
    name: "",
  });
  const [creating, setCreating] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [healthStatus, setHealthStatus] = useState<"ok" | "error" | "checking">("checking");

  // Check health
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${AUTOCLIP_API}/api/v1/health/`);
      setHealthStatus(res.ok ? "ok" : "error");
    } catch {
      setHealthStatus("error");
    }
  }, []);

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${AUTOCLIP_API}/api/v1/projects`);
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      setProjects(data.projects || data || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch clips for a project
  const fetchClips = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`${AUTOCLIP_API}/api/v1/projects/${projectId}/clips`);
      if (!res.ok) throw new Error("Failed to fetch clips");
      const data = await res.json();
      setClips(data.clips || data || []);
    } catch (e: any) {
      console.error("Failed to fetch clips:", e);
    }
  }, []);

  // Create new project
  const createProject = useCallback(async () => {
    if (!newProject.source_url && newProject.source_type !== "upload") return;
    try {
      setCreating(true);
      const res = await fetch(`${AUTOCLIP_API}/api/v1/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProject.name || `AutoClip ${Date.now()}`,
          source_type: newProject.source_type,
          source_url: newProject.source_url,
        }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      setShowNewProject(false);
      setNewProject({ source_type: "youtube", source_url: "", name: "" });
      fetchProjects();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }, [newProject, fetchProjects]);

  // Process a project
  const processProject = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`${AUTOCLIP_API}/api/v1/projects/${projectId}/process`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to start processing");
      fetchProjects();
    } catch (e: any) {
      setError(e.message);
    }
  }, [fetchProjects]);

  // Delete a project
  const deleteProject = useCallback(async (projectId: string) => {
    try {
      await fetch(`${AUTOCLIP_API}/api/v1/projects/${projectId}`, { method: "DELETE" });
      fetchProjects();
    } catch (e: any) {
      setError(e.message);
    }
  }, [fetchProjects]);

  useEffect(() => {
    checkHealth();
    fetchProjects();
    const interval = setInterval(fetchProjects, 5000);
    return () => clearInterval(interval);
  }, [checkHealth, fetchProjects]);

  useEffect(() => {
    if (selectedProject) fetchClips(selectedProject);
  }, [selectedProject, fetchClips]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "processing":
      case "downloading":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <Scissors className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">AutoClip</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered video clipping & highlight generation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Health indicator */}
          <div className="flex items-center gap-2 text-sm">
            <div
              className={`w-2 h-2 rounded-full ${
                healthStatus === "ok"
                  ? "bg-green-500"
                  : healthStatus === "error"
                    ? "bg-red-500"
                    : "bg-yellow-500"
              }`}
            />
            <span className="text-muted-foreground">
              {healthStatus === "ok"
                ? "Connected"
                : healthStatus === "error"
                  ? "Offline"
                  : "Checking..."}
            </span>
          </div>
          <button
            onClick={() => setShowNewProject(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            New Project
          </button>
          <button
            onClick={fetchProjects}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">New AutoClip Project</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Project Name</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="My Video Clips"
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Source</label>
                <div className="flex gap-2">
                  {(["youtube", "bilibili", "upload"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setNewProject({ ...newProject, source_type: type })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        newProject.source_type === type
                          ? "bg-purple-600 text-white"
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      {type === "youtube" ? "🎬 YouTube" : type === "bilibili" ? "📺 Bilibili" : "📁 Upload"}
                    </button>
                  ))}
                </div>
              </div>
              {newProject.source_type !== "upload" && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Video URL</label>
                  <input
                    type="url"
                    value={newProject.source_url}
                    onChange={(e) => setNewProject({ ...newProject, source_url: e.target.value })}
                    placeholder={
                      newProject.source_type === "youtube"
                        ? "https://youtube.com/watch?v=..."
                        : "https://bilibili.com/video/BV..."
                    }
                    className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowNewProject(false)}
                className="px-4 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createProject}
                disabled={creating || (!newProject.source_url && newProject.source_type !== "upload")}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
                Create & Process
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-700">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Film className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a new project to start clipping videos with AI
            </p>
            <button
              onClick={() => setShowNewProject(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`border rounded-xl p-4 transition-all hover:shadow-md ${
                  selectedProject === project.id ? "border-purple-500 bg-purple-500/5" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {statusIcon(project.status)}
                      <h3 className="font-medium">{project.name}</h3>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-muted">
                        {project.source_type}
                      </span>
                    </div>
                    {project.source_url && (
                      <a
                        href={project.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <LinkIcon className="w-3 h-3" />
                        {project.source_url.substring(0, 60)}...
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{project.clips_count} clips</span>
                      <span>Status: {project.status}</span>
                      <span>{new Date(project.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setSelectedProject(
                          selectedProject === project.id ? null : project.id
                        )
                      }
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                    {project.status === "pending" && (
                      <button
                        onClick={() => processProject(project.id)}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        Process
                      </button>
                    )}
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Clips Panel */}
                {selectedProject === project.id && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3">Generated Clips</h4>
                    {clips.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No clips generated yet. Process the project first.
                      </p>
                    ) : (
                      <div className="grid gap-2">
                        {clips.map((clip) => (
                          <div
                            key={clip.id}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-16 h-10 bg-muted rounded flex items-center justify-center">
                                <Play className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{clip.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatTime(clip.start_time)} - {formatTime(clip.end_time)} • Score:{" "}
                                  {(clip.score * 100).toFixed(0)}%
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {clip.video_path && (
                                <a
                                  href={`${AUTOCLIP_API}/uploads/${clip.video_path}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 hover:bg-muted rounded-lg transition-colors"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
