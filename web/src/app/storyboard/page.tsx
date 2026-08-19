"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Film,
  GripVertical,
  LoaderCircle,
  Play,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { triggerConfetti } from "@/components/confetti";
import webConfig from "@/constants/common-env";
import { getStoredAuthKey } from "@/store/auth";

type LayerStatus = "idle" | "generating" | "done" | "error";

type StoryLayer = {
  id: string;
  prompt: string;
  model: string;
  status: LayerStatus;
  videoUrl: string;
  error: string;
  collapsed: boolean;
};

const VIDEO_MODELS = [
  { id: "veo-3.1", label: "Veo 3.1 (Best)", desc: "Highest quality" },
  { id: "veo-3", label: "Veo 3", desc: "Good quality" },
  { id: "veo-2", label: "Veo 2", desc: "Fast generation" },
];

function createLayer(index: number): StoryLayer {
  return {
    id: `layer-${Date.now()}-${index}`,
    prompt: "",
    model: "veo-3.1",
    status: "idle",
    videoUrl: "",
    error: "",
    collapsed: false,
  };
}

function StoryboardContent() {
  const [title, setTitle] = useState("My Storyboard");
  const [layers, setLayers] = useState<StoryLayer[]>([createLayer(0), createLayer(1)]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [globalModel, setGlobalModel] = useState("veo-3.1");
  const abortRef = useRef<AbortController | null>(null);

  const updateLayer = useCallback((id: string, updates: Partial<StoryLayer>) => {
    setLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, ...updates } : layer)));
  }, []);

  const addLayer = () => {
    setLayers((prev) => [...prev, createLayer(prev.length)]);
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((layer) => layer.id !== id);
    });
  };

  const moveLayer = (id: string, direction: "up" | "down") => {
    setLayers((prev) => {
      const index = prev.findIndex((layer) => layer.id === id);
      if (index === -1) return prev;
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });
  };

  const generateLayer = async (layer: StoryLayer): Promise<string> => {
    const authKey = await getStoredAuthKey();
    const baseUrl = webConfig.apiUrl.replace(/\/$/, "");

    const response = await fetch(`${baseUrl}/v1/videos/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authKey}`,
      },
      body: JSON.stringify({
        model: layer.model || globalModel,
        prompt: layer.prompt,
        n: 1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const videos = data.data || [];
    if (videos.length === 0) {
      throw new Error("No video returned");
    }

    const video = videos[0];
    const baseUrlClean = webConfig.apiUrl.replace(/\/$/, "");
    return video.url.startsWith("http") ? video.url : `${baseUrlClean}${video.url}`;
  };

  const generateAll = async () => {
    const layersWithPrompt = layers.filter((layer) => layer.prompt.trim());
    if (layersWithPrompt.length === 0) {
      toast.error("Add at least one layer with a prompt");
      return;
    }

    setIsGenerating(true);
    abortRef.current = new AbortController();

    let completed = 0;
    const total = layersWithPrompt.length;

    try {
      for (const layer of layersWithPrompt) {
        if (abortRef.current.signal.aborted) break;

        updateLayer(layer.id, { status: "generating", error: "" });

        try {
          const videoUrl = await generateLayer(layer);
          updateLayer(layer.id, { status: "done", videoUrl });
          completed++;
          toast.success(`Layer ${completed}/${total} generated`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Generation failed";
          updateLayer(layer.id, { status: "error", error: message });
          toast.error(`Layer failed: ${message}`);
        }
      }

      if (completed > 0) {
        triggerConfetti();
        toast.success(`Storyboard complete! ${completed}/${total} layers generated`);
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    setIsGenerating(false);
    toast.info("Generation stopped");
  };

  const totalDuration = layers.length * 30;
  const completedLayers = layers.filter((layer) => layer.status === "done").length;

  return (
    <section className="mx-auto w-full max-w-[900px] px-3 pt-2 pb-10 sm:px-6 sm:pt-4">
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-stone-800 to-stone-950 text-white shadow-md dark:from-stone-200 dark:to-stone-400 dark:text-stone-950">
            <Film className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              Storyboard
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Generate sequential videos layer by layer. Each layer = 30 seconds.
            </p>
          </div>
        </div>
      </div>

      {/* Story Settings */}
      <Card className="mb-4 rounded-2xl border-white/80 bg-white/90 shadow-sm dark:border-white/5 dark:bg-white/5 animate-fade-in">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-stone-600 dark:text-stone-400">Story Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter story title..."
                className="h-9 rounded-xl border-stone-200 bg-white text-sm dark:border-white/10 dark:bg-white/5"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600 dark:text-stone-400">Default Model</label>
              <select
                value={globalModel}
                onChange={(e) => setGlobalModel(e.target.value)}
                className="h-9 rounded-xl border border-stone-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-white/5 dark:text-stone-200"
              >
                {VIDEO_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-3 text-xs text-stone-500 dark:text-stone-400">
            <span>{layers.length} layers</span>
            <span>•</span>
            <span>~{totalDuration}s total</span>
            <span>•</span>
            <span>{completedLayers}/{layers.length} completed</span>
          </div>
        </CardContent>
      </Card>

      {/* Layers */}
      <div className="space-y-3 stagger-children">
        {layers.map((layer, index) => (
          <LayerCard
            key={layer.id}
            layer={layer}
            index={index}
            total={layers.length}
            globalModel={globalModel}
            onUpdate={updateLayer}
            onRemove={() => removeLayer(layer.id)}
            onMoveUp={() => moveLayer(layer.id, "up")}
            onMoveDown={() => moveLayer(layer.id, "down")}
            onToggleCollapse={() => updateLayer(layer.id, { collapsed: !layer.collapsed })}
          />
        ))}
      </div>

      {/* Add Layer Button */}
      <div className="mt-4 animate-fade-in">
        <Button
          variant="outline"
          className="w-full rounded-xl border-dashed border-stone-300 text-stone-600 hover:bg-stone-50 hover:border-stone-400 dark:border-white/10 dark:text-stone-400 dark:hover:bg-white/5"
          onClick={addLayer}
        >
          <Plus className="mr-2 size-4" />
          Add Layer ({layers.length * 30}s)
        </Button>
      </div>

      {/* Generate Button */}
      <div className="mt-6 flex gap-3 animate-fade-in">
        {isGenerating ? (
          <Button
            className="flex-1 h-12 rounded-xl bg-rose-600 text-white hover:bg-rose-700 shadow-lg"
            onClick={stopGeneration}
          >
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            Stop Generation
          </Button>
        ) : (
          <Button
            className="flex-1 h-12 rounded-xl bg-stone-900 text-white hover:bg-stone-800 shadow-lg dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            onClick={generateAll}
            disabled={layers.every((l) => !l.prompt.trim())}
          >
            <Wand2 className="mr-2 size-4" />
            Generate Storyboard ({layers.filter((l) => l.prompt.trim()).length} layers)
          </Button>
        )}
      </div>
    </section>
  );
}

function LayerCard({
  layer,
  index,
  total,
  globalModel,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onToggleCollapse,
}: {
  layer: StoryLayer;
  index: number;
  total: number;
  globalModel: string;
  onUpdate: (id: string, updates: Partial<StoryLayer>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
}) {
  const statusColors: Record<LayerStatus, string> = {
    idle: "bg-stone-100 text-stone-500 dark:bg-white/5 dark:text-stone-400",
    generating: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    error: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  };

  const statusLabels: Record<LayerStatus, string> = {
    idle: "Ready",
    generating: "Generating...",
    done: "Complete",
    error: "Error",
  };

  return (
    <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm dark:border-white/5 dark:bg-white/5 overflow-hidden">
      {/* Layer Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-stone-50/50 dark:hover:bg-white/3 transition-colors"
        onClick={onToggleCollapse}
      >
        <GripVertical className="size-4 text-stone-300 dark:text-stone-600 shrink-0" />
        <div className="flex size-7 items-center justify-center rounded-lg bg-stone-900 text-white text-xs font-bold dark:bg-stone-100 dark:text-stone-900 shrink-0">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
            {layer.prompt || `Layer ${index + 1}`}
          </div>
          <div className="text-[10px] text-stone-400 dark:text-stone-500">
            {(index) * 30}s - {(index + 1) * 30}s
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[layer.status]}`}>
          {statusLabels[layer.status]}
        </span>
        {layer.collapsed ? <ChevronDown className="size-4 text-stone-400" /> : <ChevronUp className="size-4 text-stone-400" />}
      </div>

      {/* Layer Content */}
      {!layer.collapsed && (
        <div className="px-4 pb-4 space-y-3 border-t border-stone-100 dark:border-white/5 pt-3">
          {/* Prompt */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-600 dark:text-stone-400">Scene Prompt</label>
            <Textarea
              value={layer.prompt}
              onChange={(e) => onUpdate(layer.id, { prompt: e.target.value })}
              placeholder={`Describe scene ${index + 1}... (e.g., "A wide shot of a futuristic city at sunset, camera slowly panning right")`}
              rows={3}
              className="rounded-xl border-stone-200 bg-white text-sm resize-none dark:border-white/10 dark:bg-white/5 dark:text-stone-200"
            />
          </div>

          {/* Model + Actions */}
          <div className="flex items-center gap-2">
            <select
              value={layer.model}
              onChange={(e) => onUpdate(layer.id, { model: e.target.value })}
              className="h-8 rounded-lg border border-stone-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-white/5 dark:text-stone-200"
            >
              {VIDEO_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-stone-400 hover:text-stone-600"
              onClick={onMoveUp}
              disabled={index === 0}
            >
              <ChevronUp className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-stone-400 hover:text-stone-600"
              onClick={onMoveDown}
              disabled={index === total - 1}
            >
              <ChevronDown className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
              onClick={onRemove}
              disabled={total <= 1}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>

          {/* Video Preview */}
          {layer.status === "done" && layer.videoUrl && (
            <div className="rounded-xl overflow-hidden border border-stone-200 dark:border-white/10">
              <video
                src={layer.videoUrl}
                controls
                className="w-full max-h-[240px] bg-black"
                preload="metadata"
              >
                Your browser does not support video.
              </video>
            </div>
          )}

          {/* Error */}
          {layer.status === "error" && layer.error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-900/20 dark:text-rose-400">
              <AlertCircle className="size-3.5 shrink-0" />
              {layer.error}
            </div>
          )}

          {/* Generating indicator */}
          {layer.status === "generating" && (
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
              <LoaderCircle className="size-3.5 animate-spin shrink-0" />
              Generating video... This may take 1-2 minutes.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function StoryboardPage() {
  const { isCheckingAuth, session } = useAuthGuard();

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return <StoryboardContent />;
}
