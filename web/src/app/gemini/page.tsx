"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  FileImage,
  Gem,
  LoaderCircle,
  Plus,
  Search,
  Settings,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { ChatMessageView } from "@/app/chat/components/chat-message";
import { streamChatCompletion } from "@/app/chat/components/stream";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createGeminiGem,
  deleteGeminiGem,
  editImage,
  fetchGeminiAccounts,
  fetchGeminiGems,
  fetchGeminiStatus,
  fetchModels,
  generateImage,
  generateVideo,
  runGeminiDeepResearch,
  type GeminiAccount,
  type GeminiGem,
  type GeminiModelInfo,
  type GeminiStatus,
  type Model,
} from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  messageText,
  toChatApiMessages,
  type ChatContentPart,
  type ChatMessage,
} from "@/store/chat-conversations";

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl: string, fileName: string, mimeType?: string) {
  const [header, content] = dataUrl.split(",", 2);
  const matchedMimeType = header.match(/data:(.*?);base64/)?.[1];
  const binary = atob(content || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mimeType || matchedMimeType || "image/png" });
}

function GeminiChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [gem, setGem] = useState("");
  const [gems, setGems] = useState<GeminiGem[]>([]);
  const [accounts, setAccounts] = useState<GeminiAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [attachedImages, setAttachedImages] = useState<Array<{ id: string; name: string; dataUrl: string }>>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [modelData, gemData, accountData] = await Promise.all([fetchModels(), fetchGeminiGems(), fetchGeminiAccounts()]);
        if (cancelled) {
          return;
        }
        const geminiModels = (Array.isArray(modelData.data) ? modelData.data : [])
          .map((item: Model) => String(item.id || "").trim())
          .filter((id) => {
            const normalized = id.toLowerCase();
            return (
              normalized.startsWith("gemini") ||
              normalized.startsWith("models/gemini") ||
              normalized.includes("nano-banana") ||
              normalized.includes("deep-research")
            );
          })
          .filter((id, index, list) => list.indexOf(id) === index);
        setModels(geminiModels);
        if (geminiModels.length > 0) {
          setModel((current) => (geminiModels.includes(current) ? current : geminiModels[0]));
        }
        setGems(Array.isArray(gemData.gems) ? gemData.gems : []);
        const pool = Array.isArray(accountData.accounts)
          ? accountData.accounts.filter((account: GeminiAccount) => account.status === "normal")
          : [];
        setAccounts(pool);
        setAccountId((current) => (pool.some((account: GeminiAccount) => account.id === current) ? current : pool[0]?.id || ""));
      } catch {
        // Gemini may be disabled — UI stays usable with an empty model list
      } finally {
        if (!cancelled) {
          setIsLoadingModels(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const handleAttach = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    try {
      const loaded = await Promise.all(
        files.map(async (file) => ({
          id: `${file.name}-${file.size}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          dataUrl: await readImageFile(file),
        })),
      );
      setAttachedImages((current) => [...current, ...loaded].slice(0, 4));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to read image");
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if ((!text && attachedImages.length === 0) || streamingRef.current) {
      return;
    }
    const userContent: string | ChatContentPart[] =
      attachedImages.length > 0
        ? [
            ...(text ? [{ type: "text" as const, text }] : []),
            ...attachedImages.map((image) => ({
              type: "image_url" as const,
              image_url: { url: image.dataUrl },
            })),
          ]
        : text;
    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: createId(), role: "user", content: userContent, createdAt: now };
    const assistantMessage: ChatMessage = { id: createId(), role: "assistant", content: "", createdAt: now };
    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);
    setInput("");
    setAttachedImages([]);
    streamingRef.current = true;
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = "";
    const result = await streamChatCompletion({
      model: model || models[0] || "auto",
      messages: toChatApiMessages(nextMessages),
      gem: gem || undefined,
      accountId: accountId || undefined,
      signal: controller.signal,
      onDelta: (delta) => {
        accumulated += delta;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id ? { ...message, content: message.content + delta } : message,
          ),
        );
      },
    });

    streamingRef.current = false;
    setIsStreaming(false);
    abortRef.current = null;
    if (result.ok || result.error === "aborted") {
      if (result.error === "aborted") {
        toast.info("Generation stopped");
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id ? { ...message, content: accumulated } : message,
        ),
      );
    } else {
      toast.error(result.error || "Request failed");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id ? { ...message, error: result.error || "Request failed" } : message,
        ),
      );
    }
  };

  return (
    <div className="flex h-[calc(100dvh-15.5rem)] min-h-[420px] flex-col gap-3 sm:h-[calc(100dvh-14.5rem)]">
      <div ref={viewportRef} className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-1 py-2 sm:px-2">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-stone-950 text-white">
              <Bot className="size-5" />
            </div>
            <h3 className="text-base font-semibold text-stone-900">Gemini Chat</h3>
            <p className="max-w-sm text-sm leading-6 text-stone-500">
              Chat with Gemini via your web cookie — streaming responses, thinking, image attachments, and custom Gems.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-6 py-2">
            {messages.map((message) => (
              <ChatMessageView key={message.id} message={message} isStreaming={isStreaming && message.id === messages[messages.length - 1]?.id && message.role === "assistant"} />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleAttach(Array.from(event.target.files || []));
            event.currentTarget.value = "";
          }}
        />
        {attachedImages.length > 0 ? (
          <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
            {attachedImages.map((image) => (
              <div key={image.id} className="relative size-14 shrink-0">
                <img src={image.dataUrl} alt={image.name} className="size-14 rounded-xl border border-stone-200 object-cover" />
                <button
                  type="button"
                  onClick={() => setAttachedImages((current) => current.filter((item) => item.id !== image.id))}
                  className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 hover:text-stone-800"
                  aria-label={`Remove ${image.name}`}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-[0_14px_60px_-42px_rgba(15,23,42,0.45)]">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={models.length > 0 ? "Message Gemini…" : "Gemini not configured — enable it in Settings first"}
            rows={1}
            disabled={models.length === 0}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!isStreaming) {
                  void handleSubmit();
                }
              }
            }}
            className="max-h-40 min-h-[56px] resize-none rounded-[24px] border-0 bg-transparent px-4 pt-4 pb-2 text-[15px] leading-6 text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0"
          />
          <div className="flex items-end justify-between gap-2 rounded-b-[24px] border-t border-stone-100 bg-white px-3 pt-2 pb-3">
            <div className="hide-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:pb-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
                aria-label="Attach image"
              >
                <FileImage className="size-3.5" />
                <span className="hidden sm:inline">Image</span>
              </button>
              <div className="relative shrink-0">
                <Select value={model || "default"} onValueChange={(value) => setModel(value === "default" ? "" : value)}>
                  <SelectTrigger className="h-9 max-w-[170px] rounded-full border-stone-200 bg-white text-xs font-medium text-stone-700 shadow-none sm:max-w-[210px] sm:text-sm" aria-label="Model">
                    <span className="truncate">
                      {isLoadingModels ? "Loading…" : model || "Select model"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="z-[120]">
                    {models.length === 0 ? <SelectItem value="default">No Gemini models</SelectItem> : null}
                    {models.map((option) => (
                      <SelectItem key={option} value={option} className="pr-10">
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {gems.length > 0 ? (
                <div className="relative shrink-0">
                  <Select value={gem || "default"} onValueChange={(value) => setGem(value === "default" ? "" : value)}>
                    <SelectTrigger className="h-9 max-w-[140px] rounded-full border-stone-200 bg-white text-xs font-medium text-stone-700 shadow-none sm:max-w-[170px] sm:text-sm" aria-label="Gem">
                      <span className="truncate">{gem ? gems.find((item) => item.id === gem)?.name || gem : "Gem: default"}</span>
                    </SelectTrigger>
                    <SelectContent className="z-[120]">
                      <SelectItem value="default">Default</SelectItem>
                      {gems.map((item) => (
                        <SelectItem key={item.id} value={item.id} className="pr-10">
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {accounts.length > 1 ? (
                <div className="relative shrink-0">
                  <Select value={accountId || "default"} onValueChange={(value) => setAccountId(value === "default" ? "" : value)}>
                    <SelectTrigger className="h-9 max-w-[150px] rounded-full border-stone-200 bg-white text-xs font-medium text-stone-700 shadow-none sm:max-w-[190px] sm:text-sm" aria-label="Account">
                      <span className="truncate">
                        {accountId
                          ? accounts.find((item) => item.id === accountId)?.email || accounts.find((item) => item.id === accountId)?.label || "Account"
                          : "Account: auto"}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-[120]">
                      <SelectItem value="default">Auto</SelectItem>
                      {accounts.map((item) => (
                        <SelectItem key={item.id} value={item.id} className="pr-10">
                          {item.email || item.label || item.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 transition hover:bg-stone-100"
                aria-label="Stop generating"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={(!input.trim() && attachedImages.length === 0) || models.length === 0}
                className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-stone-950 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                aria-label="Send message"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeminiImageTab() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [count, setCount] = useState("1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<Array<{ b64_json?: string; url?: string; revised_prompt?: string }>>([]);
  const [referenceImages, setReferenceImages] = useState<Array<{ id: string; name: string; dataUrl: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ index: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchModels();
        if (cancelled) {
          return;
        }
        const imageModels = (Array.isArray(data.data) ? data.data : [])
          .filter((item: Model) => {
            const caps = (item as Model & { capabilities?: string[] }).capabilities || [];
            const normalized = String(item.id || "").toLowerCase();
            const isGemini =
              normalized.startsWith("gemini") ||
              normalized.startsWith("models/gemini") ||
              normalized.includes("nano-banana") ||
              normalized.includes("banana");
            if (!isGemini) {
              return false;
            }
            if (caps.length > 0) {
              return caps.includes("image") || caps.includes("canvas");
            }
            return normalized.includes("image") || normalized.includes("banana");
          })
          .map((item: Model) => String(item.id || "").trim())
          .filter((id, index, list) => list.indexOf(id) === index);
        setModels(imageModels);
        if (imageModels.length > 0) {
          setModel((current) => (imageModels.includes(current) ? current : imageModels[0]));
        }
      } catch {
        // ignore
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAttach = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    try {
      const loaded = await Promise.all(
        files.map(async (file) => ({
          id: `${file.name}-${file.size}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          dataUrl: await readImageFile(file),
        })),
      );
      setReferenceImages((current) => [...current, ...loaded].slice(0, 4));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to read reference image");
    }
  };

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!text || isGenerating) {
      return;
    }
    setIsGenerating(true);
    try {
      const n = Math.max(1, Math.min(4, Number(count) || 1));
      if (referenceImages.length > 0) {
        const response = await editImage(
          referenceImages.map((image) => dataUrlToFile(image.dataUrl, image.name)),
          text,
          model || undefined,
        );
        setResults(response.data || []);
      } else {
        const response = await generateImage(text, model || undefined, undefined, "auto");
        setResults(response.data || []);
      }
      toast.success(referenceImages.length > 0 ? "Image edited" : "Image generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveResult = (index: number) => {
    setDeleteConfirm({ index });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium text-stone-700">Prompt</label>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the image to generate (or the edit to apply when reference images are attached)"
            rows={2}
            className="min-h-[64px] resize-none rounded-xl border-stone-200 bg-white text-sm shadow-none"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Model</label>
            <Select value={model || "default"} onValueChange={(value) => setModel(value === "default" ? "" : value)}>
              <SelectTrigger className="h-10 w-full min-w-[150px] rounded-xl border-stone-200 bg-white shadow-none">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent className="z-[120]">
                {models.length === 0 ? <SelectItem value="default">No image model available</SelectItem> : null}
                {models.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Count</label>
            <input
              type="number"
              min={1}
              max={4}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              className="h-10 w-20 rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-700"
            />
          </div>
          <Button
            className="h-10 rounded-xl bg-stone-950 text-white hover:bg-stone-800"
            onClick={() => void handleGenerate()}
            disabled={isGenerating || !prompt.trim() || models.length === 0}
          >
            {isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
            {isGenerating ? "Generating…" : referenceImages.length > 0 ? "Edit" : "Generate"}
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleAttach(Array.from(event.target.files || []));
          event.currentTarget.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
        >
          <Upload className="size-3.5" />
          Attach reference image{referenceImages.length > 0 ? ` (${referenceImages.length})` : ""} — for editing
        </button>
        {referenceImages.map((image) => (
          <div key={image.id} className="relative size-12">
            <img src={image.dataUrl} alt={image.name} className="size-12 rounded-lg border border-stone-200 object-cover" />
            <button
              type="button"
              onClick={() => setReferenceImages((current) => current.filter((item) => item.id !== image.id))}
              className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-stone-900 text-white"
              aria-label={`Remove ${image.name}`}
            >
              <Trash2 className="size-2.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {results.map((image, index) => {
          const src = image.b64_json ? `data:image/png;base64,${image.b64_json}` : image.url || "";
          return (
            <div key={`${index}-${src.slice(0, 24)}`} className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={image.revised_prompt || `Generated image ${index + 1}`} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center text-xs text-stone-400">No data</div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                <a
                  href={src}
                  download={`gemini-${index + 1}.png`}
                  className="rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-stone-800"
                >
                  Save
                </a>
                <button
                  type="button"
                  onClick={() => handleRemoveResult(index)}
                  className="rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-rose-600"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => (!open ? setDeleteConfirm(null) : null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>Delete image?</DialogTitle>
            <DialogDescription className="text-sm leading-6">This removes the image from this session. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => {
                if (deleteConfirm) {
                  setResults((current) => current.filter((_, index) => index !== deleteConfirm.index));
                }
                setDeleteConfirm(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GeminiResearchTab() {
  const [query, setQuery] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<{ title: string; report: string } | null>(null);

  const handleRun = async () => {
    const prompt = query.trim();
    if (!prompt || isRunning) {
      return;
    }
    setIsRunning(true);
    setReport(null);
    try {
      const data = await runGeminiDeepResearch(prompt, 600);
      setReport(data.result);
      toast.success("Deep research complete");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Deep research failed");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Search className="size-4 text-stone-500" />
          <h3 className="text-sm font-semibold text-stone-900">Deep Research</h3>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask a complex question that needs multi-step web research…"
            rows={3}
            className="min-h-[72px] flex-1 resize-none rounded-xl border-stone-200 bg-white text-sm shadow-none"
          />
          <Button
            className="h-10 rounded-xl bg-stone-950 px-6 text-white hover:bg-stone-800"
            onClick={() => void handleRun()}
            disabled={isRunning || !query.trim()}
          >
            {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
            {isRunning ? "Researching…" : "Run research"}
          </Button>
        </div>
        <p className="mt-2 text-xs leading-5 text-stone-500">
          Takes a few minutes. Gemini browses sources and compiles a structured report with citations.
        </p>
      </div>

      {isRunning ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white p-10 text-center">
          <LoaderCircle className="size-6 animate-spin text-stone-400" />
          <p className="text-sm text-stone-600">Researching “{query.trim().slice(0, 80)}…”</p>
          <p className="text-xs text-stone-400">This usually takes 2–5 minutes. Keep this tab open.</p>
        </div>
      ) : null}

      {report ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-xl font-bold tracking-tight text-stone-900">{report.title}</h2>
          <div className="prose-sm text-sm leading-7 whitespace-pre-wrap text-stone-800">
            {report.report}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GeminiGemsTab({ gems, onChanged }: { gems: GeminiGem[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<GeminiGem | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || !prompt.trim() || isCreating) {
      return;
    }
    setIsCreating(true);
    try {
      await createGeminiGem(name.trim(), prompt.trim(), description.trim());
      setName("");
      setPrompt("");
      setDescription("");
      toast.success("Gem created");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create Gem");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (gem: GeminiGem) => {
    setCreatingId(gem.id);
    try {
      await deleteGeminiGem(gem.id);
      toast.success("Gem deleted");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete Gem");
    } finally {
      setCreatingId(null);
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Gem className="size-4 text-stone-500" />
          <h3 className="text-sm font-semibold text-stone-900">Create a custom Gem</h3>
        </div>
        <div className="grid gap-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Gem name (e.g. Code Reviewer)"
            className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-700"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Short description (optional)"
            className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-700"
          />
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="System prompt / instructions for this Gem…"
            rows={3}
            className="min-h-[64px] resize-none rounded-xl border-stone-200 bg-white text-sm shadow-none"
          />
          <div className="flex justify-end">
            <Button
              className="h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800"
              onClick={() => void handleCreate()}
              disabled={isCreating || !name.trim() || !prompt.trim()}
            >
              {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create Gem
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {gems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center text-sm text-stone-500">
            No custom Gems yet. Gems let you save a persona or instruction set and reuse it in Gemini Chat.
          </div>
        ) : (
          gems.map((gem) => (
            <div key={gem.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-stone-900">{gem.name}</span>
                  {gem.predefined ? (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">predefined</span>
                  ) : null}
                </div>
                {gem.description ? <p className="mt-0.5 truncate text-xs text-stone-500">{gem.description}</p> : null}
              </div>
              {!gem.predefined ? (
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(gem)}
                  disabled={creatingId === gem.id}
                  className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  aria-label={`Delete ${gem.name}`}
                >
                  {creatingId === gem.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => (!open ? setDeleteConfirm(null) : null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>Delete Gem?</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              Delete “{deleteConfirm?.name}”? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => deleteConfirm && void handleDelete(deleteConfirm)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const CAPABILITY_LABELS: Record<string, string> = {
  chat: "Chat",
  image: "Image",
  canvas: "Canvas",
  video: "Video",
  audio: "Audio",
  research: "Research",
};

function GeminiVideoTab() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("veo-3.1");
  const [models, setModels] = useState<string[]>(["veo-3.1", "veo-3", "veo-2"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<Array<{ url: string; thumbnail?: string | null; title?: string }>>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ index: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchModels();
        if (cancelled) {
          return;
        }
        const videoModels = (Array.isArray(data.data) ? data.data : [])
          .filter((item: Model) => {
            const caps = (item as Model & { capabilities?: string[] }).capabilities || [];
            const normalized = String(item.id || "").toLowerCase();
            if (caps.length > 0) {
              return caps.includes("video");
            }
            return normalized.includes("veo") || normalized.includes("video");
          })
          .map((item: Model) => String(item.id || "").trim())
          .filter((id, index, list) => list.indexOf(id) === index);
        if (videoModels.length > 0) {
          setModels(videoModels);
          setModel((current) => (videoModels.includes(current) ? current : videoModels[0]));
        }
      } catch {
        // keep defaults
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!text || isGenerating) {
      return;
    }
    setIsGenerating(true);
    try {
      const response = await generateVideo(text, model, 1);
      setResults(response.data || []);
      if ((response.data || []).length === 0) {
        toast.error("No video returned");
      } else {
        toast.success("Video generated");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate video");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium text-stone-700">Prompt</label>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the video to generate (Veo). E.g. a cinematic drone shot over a misty forest…"
            rows={2}
            className="min-h-[64px] resize-none rounded-xl border-stone-200 bg-white text-sm shadow-none"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Model</label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-10 w-full min-w-[150px] rounded-xl border-stone-200 bg-white shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[120]">
                {models.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="h-10 rounded-xl bg-stone-950 text-white hover:bg-stone-800"
            onClick={() => void handleGenerate()}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <FileImage className="size-4" />}
            {isGenerating ? "Generating…" : "Generate video"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
        Veo video generation can take a few minutes and requires an account with video access (Gemini Advanced). Videos
        are saved locally and served through this app.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((video, index) => (
          <div key={`${index}-${video.url}`} className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <video src={video.url} poster={video.thumbnail || undefined} controls className="aspect-video w-full" />
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
              <a
                href={video.url}
                download={video.title ? `${video.title}.mp4` : `gemini-video-${index + 1}.mp4`}
                className="rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-stone-800"
              >
                Save
              </a>
              <button
                type="button"
                onClick={() => setDeleteConfirm({ index })}
                className="rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-rose-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => (!open ? setDeleteConfirm(null) : null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>Delete video?</DialogTitle>
            <DialogDescription className="text-sm leading-6">This removes the video from this session.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => {
                if (deleteConfirm) {
                  setResults((current) => current.filter((_, index) => index !== deleteConfirm.index));
                }
                setDeleteConfirm(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GeminiModelsTab({ accounts }: { accounts: GeminiAccount[] }) {
  const [models, setModels] = useState<Array<GeminiModelInfo & { available?: boolean; capabilities?: string[] }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchModels();
        if (cancelled) {
          return;
        }
        const geminiModels = (Array.isArray(data.data) ? data.data : [])
          .filter((item: Model) => {
            const owned = (item as Model & { owned_by?: string }).owned_by;
            const normalized = String(item.id || "").toLowerCase();
            return (
              owned === "gemini" ||
              normalized.startsWith("gemini") ||
              normalized.startsWith("models/gemini") ||
              normalized.includes("veo") ||
              normalized.includes("banana")
            );
          })
          .map((item: Model) => item as unknown as GeminiModelInfo & { available?: boolean; capabilities?: string[] });
        setModels(geminiModels);
      } catch {
        setModels([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  const available = models.filter((model) => model.available !== false);
  const catalog = models.filter((model) => model.available === false);

  const renderModel = (model: GeminiModelInfo & { available?: boolean; capabilities?: string[] }) => (
    <div key={model.id} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm font-semibold text-stone-900">{model.id}</span>
            {model.available === false ? (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">requires {model.tier || "higher plan"}</span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">available</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-stone-500">{model.display_name || model.id}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(model.capabilities || []).map((capability) => (
            <span key={capability} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
              {CAPABILITY_LABELS[capability] || capability}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-900">Available for your accounts</h3>
          <span className="text-xs text-stone-500">{accounts.length} account(s) in pool</span>
        </div>
        <div className="space-y-2">
          {available.length === 0 ? <p className="text-sm text-stone-500">No models detected yet — run a chat first to warm up the pool.</p> : available.map(renderModel)}
        </div>
      </div>
      {catalog.length > 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-semibold text-stone-900">Known Gemini models</h3>
          <p className="mb-3 text-xs text-stone-500">These unlock automatically when an account with the right plan is added (Veo video, Nano Banana canvas, thinking, etc.).</p>
          <div className="space-y-2">{catalog.map(renderModel)}</div>
        </div>
      ) : null}
    </div>
  );
}

function GeminiPageContent() {
  const [status, setStatus] = useState<GeminiStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [gems, setGems] = useState<GeminiGem[]>([]);
  const [activeTab, setActiveTab] = useState("chat");
  const [accounts, setAccounts] = useState<GeminiAccount[]>([]);

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchGeminiStatus();
      setStatus(data.result);
    } catch {
      setStatus(null);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const loadGems = useCallback(async () => {
    try {
      const data = await fetchGeminiGems();
      setGems(Array.isArray(data.gems) ? data.gems : []);
    } catch {
      setGems([]);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await fetchGeminiAccounts();
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadGems();
    void loadAccounts();
  }, [loadStatus, loadGems, loadAccounts]);

  const statusBadge = status
    ? status.ready
      ? "Connected"
      : status.configured
        ? "Not connected"
        : "Not configured"
    : isLoadingStatus
      ? "Checking…"
      : "Unknown";

  const isReady = Boolean(status?.ready);

  return (
    <section className="mx-auto w-full max-w-[1380px] px-3 pt-2 pb-8 sm:px-6 sm:pt-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-stone-950 text-white">
            <Bot className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-stone-900">Gemini</h1>
            <p className="text-xs text-stone-500">Cookie-based Gemini — chat, images, deep research &amp; Gems in one place</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status?.ready
                ? "bg-emerald-50 text-emerald-700"
                : status?.configured
                  ? "bg-amber-50 text-amber-700"
                  : "bg-stone-100 text-stone-500"
            }`}
          >
            {statusBadge}
          </span>
          {accounts.length > 0 ? (
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
              {accounts.filter((account) => account.status === "normal").length}/{accounts.length} accounts
            </span>
          ) : null}
          <Button
            variant="outline"
            className="h-9 rounded-full border-stone-200 bg-white text-stone-700"
            onClick={() => window.location.assign("/settings")}
          >
            <Settings className="size-3.5" />
            Configure
          </Button>
          <Button
            variant="outline"
            className="h-9 rounded-full border-stone-200 bg-white text-stone-700"
            onClick={() => window.location.assign("/gemini-accounts")}
          >
            <Bot className="size-3.5" />
            Accounts
          </Button>
        </div>
      </div>

      {!isReady && !isLoadingStatus ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          {status?.configured
            ? "Gemini is configured but not connected. Check your cookies or click Configure."
            : "Gemini is not configured yet. Go to Settings → Gemini to add your web cookies."}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="sticky top-3 z-20 overflow-x-auto rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
          <TabsList variant="line" className="min-w-max justify-start">
            <TabsTrigger value="chat" className="px-4">
              <Bot className="mr-1.5 size-3.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="image" className="px-4">
              <FileImage className="mr-1.5 size-3.5" />
              Image / Canvas
            </TabsTrigger>
            <TabsTrigger value="video" className="px-4">
              <FileImage className="mr-1.5 size-3.5" />
              Video (Veo)
            </TabsTrigger>
            <TabsTrigger value="models" className="px-4">
              <Bot className="mr-1.5 size-3.5" />
              Models
            </TabsTrigger>
            <TabsTrigger value="research" className="px-4">
              <Search className="mr-1.5 size-3.5" />
              Research
            </TabsTrigger>
            <TabsTrigger value="gems" className="px-4">
              <Gem className="mr-1.5 size-3.5" />
              Gems ({gems.length})
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="chat">
          <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <GeminiChatTab />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="image">
          <GeminiImageTab />
        </TabsContent>
        <TabsContent value="video">
          <GeminiVideoTab />
        </TabsContent>
        <TabsContent value="models">
          <GeminiModelsTab accounts={accounts} />
        </TabsContent>
        <TabsContent value="research">
          <GeminiResearchTab />
        </TabsContent>
        <TabsContent value="gems">
          <GeminiGemsTab gems={gems} onChanged={() => void loadGems()} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

export default function GeminiPage() {
  const { isCheckingAuth, session } = useAuthGuard();

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return <GeminiPageContent />;
}
