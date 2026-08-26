"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Compass, Download, History, LoaderCircle, Paperclip, Plus, Share2, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ChatComposer, type ComposerAccount, type ComposerFile, type ComposerGem, type ComposerImage, type ComposerTool } from "./components/chat-composer";
import { ChatMessageView, DateSeparator } from "./components/chat-message";
import { CanvasView } from "./components/canvas-view";
import { streamChatCompletion } from "./components/stream";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { editImage, fetchGeminiAccounts, fetchGeminiGems, fetchModels, generateImage, generateVideo, runGeminiDeepResearch, type GeminiAccount, type GeminiGem, type Model } from "@/lib/api";
import { triggerConfetti } from "@/components/confetti";
import webConfig from "@/constants/common-env";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { useSidebarCallbacks } from "@/components/sidebar-shell";
import {
  clearChatConversations,
  deleteChatConversation,
  listChatConversations,
  renameChatConversation,
  saveChatConversation,
  toChatApiMessages,
  type ChatConversation,
  type ChatContentPart,
  type ChatMessage,
} from "@/store/chat-conversations";

const ACTIVE_CONVERSATION_STORAGE_KEY = "chatgpt2api:chat_active_conversation_id";
const CHAT_MODEL_STORAGE_KEY = "chatgpt2api:chat_last_model";
const CHAT_REASONING_STORAGE_KEY = "chatgpt2api:chat_last_reasoning_effort";
const CHAT_GEM_STORAGE_KEY = "chatgpt2api:chat_last_gem";
const CHAT_TOOL_STORAGE_KEY = "chatgpt2api:chat_last_tool";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 4;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 5;
const SCROLL_TO_LATEST_THRESHOLD = 160;

// ── Share conversation ──────────────────────────────────────────────────

function formatMessageForShare(message: { role: string; content: any; createdAt?: string }): string {
  const roleLabel = message.role === "user" ? "You" : "AI";
  const text = typeof message.content === "string"
    ? message.content
    : Array.isArray(message.content)
      ? message.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
      : "";
  return `${roleLabel}: ${text}`;
}

async function shareConversation(conversation: { title: string; messages: any[] }) {
  const header = `# ${conversation.title}\n\nExported from BecomeAI — ${new Date().toLocaleDateString()}\n\n---\n\n`;
  const body = conversation.messages
    .filter((m: any) => m.role === "user" || (m.role === "assistant" && m.content))
    .map(formatMessageForShare)
    .join("\n\n");
  const full = header + body;

  if (navigator.share) {
    try {
      await navigator.share({ title: conversation.title, text: full });
      return;
    } catch {
      // user cancelled or share not supported — fallback to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(full);
    toast.success("Conversation copied to clipboard!");
  } catch {
    // fallback: create download
    const blob = new Blob([full], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${conversation.title.replace(/[^a-z0-9]/gi, "-").slice(0, 40)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded as Markdown file");
  }
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildConversationTitle(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= 24) {
    return trimmed || "New chat";
  }
  return `${trimmed.slice(0, 24)}…`;
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sortByUpdated(conversations: ChatConversation[]) {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function readImage(file: File): Promise<ComposerImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(`${file.name} is not an image file`));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error(`${file.name} exceeds 10MB`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith("data:image/")) {
        reject(new Error(`${file.name} could not be read`));
        return;
      }
      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        dataUrl,
      });
    };
    reader.onerror = () => reject(reader.error || new Error(`${file.name} could not be read`));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<ComposerFile> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_BYTES) {
      reject(new Error(`${file.name} exceeds 1MB text limit`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        size: file.size,
        text: String(reader.result || ""),
      });
    };
    reader.onerror = () => reject(reader.error || new Error(`${file.name} could not be read`));
    reader.readAsText(file);
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

function toolResultMarkdown(prompt: string, imageUrls: string[]) {
  const usable = imageUrls.filter(Boolean);
  if (usable.length === 0) {
    return prompt;
  }
  const images = usable.map((url, index) => `![result ${index + 1}](${url})`).join("\n");
  return `${prompt}\n\n${images}`;
}

function ChatPageContent() {
  const conversationsRef = useRef<ChatConversation[]>([]);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const didLoadRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sidebarCallbacks = useSidebarCallbacks();

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("auto");
  const [models, setModels] = useState<string[]>(["auto"]);
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [gem, setGem] = useState("");
  const [gems, setGems] = useState<ComposerGem[]>([]);
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<ComposerAccount[]>([]);
  const [tool, setTool] = useState<ComposerTool>("auto");
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<ComposerFile[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);
  const [isAwayFromLatest, setIsAwayFromLatest] = useState(false);

  // Register sidebar callbacks
  useEffect(() => {
    const c = sidebarCallbacks.current;
    c.conversations = conversations;
    c.selectedConversationId = selectedConversationId;
    c.onSelectConversation = handleSelectConversation;
    c.onCreateDraft = handleCreateDraft;
    c.onDeleteConversation = handleDeleteConversation;
    c.onRenameConversation = handleRenameConversation;
    c.formatConversationTime = formatConversationTime;
    (window as any).__sidebarTriggerUpdate?.();
  });

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const isGeminiModel = useMemo(() => {
    const normalized = model.trim().toLowerCase();
    if (!normalized || normalized === "auto") {
      return false;
    }
    return (
      normalized.startsWith("gemini") ||
      normalized.startsWith("models/gemini") ||
      normalized.includes("nano-banana") ||
      normalized.includes("deep-research")
    );
  }, [model]);

  // Tools must never be sent the selected *chat* model: image/canvas use a real
  // image model, video uses a Veo model.
  const toolImageModel = useMemo(() => {
    const normalized = model.trim().toLowerCase();
    if (
      normalized.includes("banana") ||
      normalized.includes("-image") ||
      normalized.includes("image-gen")
    ) {
      return model;
    }
    return "gpt-image-2";
  }, [model]);

  const toolVideoModel = useMemo(() => {
    return model.trim().toLowerCase().includes("veo") ? model : "veo-3.1";
  }, [model]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const loadHistory = useCallback(async () => {
    try {
      const items = await listChatConversations();
      conversationsRef.current = items;
      setConversations(items);
      const storedConversationId =
        typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY) : null;
      const nextSelectedId =
        storedConversationId && items.some((conversation) => conversation.id === storedConversationId)
          ? storedConversationId
          : items[0]?.id ?? null;
      setSelectedConversationId(nextSelectedId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load chat history";
      toast.error(message);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      try {
        const data = await fetchModels();
        const items = Array.isArray(data.data) ? data.data : [];
        const chatModels = items
          .filter((item: Model) => {
            const caps = (item as Model & { capabilities?: string[] }).capabilities || [];
            const id = String(item.id || "").trim().toLowerCase();
            if (!id) {
              return false;
            }
            if (caps.length > 0) {
              return caps.includes("chat");
            }
            // Non-Gemini (GPT) models: keep chat models, drop image/video-only ones
            return !id.includes("image") && !id.includes("veo") && !id.includes("banana");
          })
          .map((item: Model) => String(item.id || "").trim())
          .filter((id, index, list) => list.indexOf(id) === index);
        if (cancelled) {
          return;
        }
        const uniqueChat = chatModels.filter((id: string) => id.toLowerCase() !== "auto");
        const options = ["auto", ...uniqueChat];
        setModels(options);
        const storedModel =
          typeof window !== "undefined" ? window.localStorage.getItem(CHAT_MODEL_STORAGE_KEY) : null;
        if (storedModel && options.includes(storedModel)) {
          setModel(storedModel);
        } else {
          setModel("auto");
        }
      } catch {
        if (!cancelled) {
          setModels(["auto"]);
          setModel("auto");
        }
      }
    };
    void loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (selectedConversationId) {
      window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, selectedConversationId);
    } else {
      window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CHAT_MODEL_STORAGE_KEY, model);
    }
  }, [model]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CHAT_REASONING_STORAGE_KEY, reasoningEffort);
      if (gem) {
        window.localStorage.setItem(CHAT_GEM_STORAGE_KEY, gem);
      } else {
        window.localStorage.removeItem(CHAT_GEM_STORAGE_KEY);
      }
      window.localStorage.setItem(CHAT_TOOL_STORAGE_KEY, tool);
    }
  }, [reasoningEffort, gem, tool]);

  useEffect(() => {
    const storedReasoning =
      typeof window !== "undefined" ? window.localStorage.getItem(CHAT_REASONING_STORAGE_KEY) : null;
    if (storedReasoning) {
      setReasoningEffort(storedReasoning);
    }
    const storedGem =
      typeof window !== "undefined" ? window.localStorage.getItem(CHAT_GEM_STORAGE_KEY) : null;
    if (storedGem) {
      setGem(storedGem);
    }
    const storedTool =
      typeof window !== "undefined" ? window.localStorage.getItem(CHAT_TOOL_STORAGE_KEY) : null;
    if (storedTool === "image" || storedTool === "canvas" || storedTool === "infinite-canvas" || storedTool === "video" || storedTool === "research" || storedTool === "anti-slop") {
      setTool(storedTool);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadGems = async () => {
      try {
        const [gemData, accountData] = await Promise.all([fetchGeminiGems(), fetchGeminiAccounts()]);
        if (cancelled) {
          return;
        }
        const items = Array.isArray(gemData.gems)
          ? gemData.gems.map((item: GeminiGem) => ({
              id: item.id,
              name: item.name,
            }))
          : [];
        setGems(items);
        const pool = Array.isArray(accountData.accounts)
          ? accountData.accounts
              .filter((account: GeminiAccount) => account.status === "normal")
              .map((account: GeminiAccount) => ({
                id: account.id,
                name: account.email || account.label || account.id.slice(0, 8),
              }))
          : [];
        setAccounts(pool);
        setAccountId((current) => (pool.some((account) => account.id === current) ? current : pool[0]?.id || ""));
      } catch {
        if (!cancelled) {
          setGems([]);
          setAccounts([]);
        }
      }
    };
    void loadGems();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = messagesViewportRef.current;
    if (!element) {
      return;
    }
    shouldStickToBottomRef.current = true;
    setIsAwayFromLatest(false);
    element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const element = messagesViewportRef.current;
    if (!element) {
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom <= SCROLL_TO_LATEST_THRESHOLD;
    setIsAwayFromLatest(distanceFromBottom > SCROLL_TO_LATEST_THRESHOLD);
  }, []);

  // Auto-scroll when the selected conversation's assistant message grows
  useEffect(() => {
    if (!selectedConversation) {
      return;
    }
    if (shouldStickToBottomRef.current) {
      requestAnimationFrame(() => {
        const element = messagesViewportRef.current;
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      });
    }
  }, [selectedConversation?.id, selectedConversation?.messages]);

  const persistConversation = useCallback(async (conversation: ChatConversation) => {
    const next = sortByUpdated([
      conversation,
      ...conversationsRef.current.filter((item) => item.id !== conversation.id),
    ]);
    conversationsRef.current = next;
    setConversations(next);
    await saveChatConversation(conversation);
  }, []);

  const updateConversation = useCallback(
    async (conversationId: string, updater: (current: ChatConversation) => ChatConversation, persist = true) => {
      const current = conversationsRef.current.find((item) => item.id === conversationId) ?? null;
      if (!current) {
        return;
      }
      const nextConversation = updater(current);
      const next = sortByUpdated([
        nextConversation,
        ...conversationsRef.current.filter((item) => item.id !== conversationId),
      ]);
      conversationsRef.current = next;
      setConversations(next);
      if (persist) {
        await saveChatConversation(nextConversation);
      }
    },
    [],
  );

  const handleCreateDraft = () => {
    if (streamingRef.current) {
      toast.info("Wait for the current response to finish or press Stop");
      return;
    }
    setSelectedConversationId(null);
    setInput("");
    setImages([]);
  };

  const handleSelectConversation = (id: string) => {
    if (streamingRef.current) {
      toast.info("Wait for the current response to finish or press Stop");
      return;
    }
    setSelectedConversationId(id);
  };

  const handleDeleteConversation = async (id: string) => {
    const nextConversations = conversationsRef.current.filter((conversation) => conversation.id !== id);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    if (selectedConversationId === id) {
      setSelectedConversationId(nextConversations[0]?.id ?? null);
    }
    try {
      await deleteChatConversation(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete chat";
      toast.error(message);
      const items = await listChatConversations();
      conversationsRef.current = items;
      setConversations(items);
    }
  };

  const handleClearHistory = async () => {
    if (streamingRef.current) {
      toast.info("Wait for the current response to finish or press Stop");
      return;
    }
    try {
      await clearChatConversations();
      conversationsRef.current = [];
      setConversations([]);
      setSelectedConversationId(null);
      toast.success("History cleared");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear history";
      toast.error(message);
    }
  };

  const handleRenameConversation = async (id: string, title: string) => {
    const nextConversations = conversations.map((conversation) =>
      conversation.id === id ? { ...conversation, title, updatedAt: new Date().toISOString() } : conversation,
    );
    conversationsRef.current = sortByUpdated(nextConversations);
    setConversations(conversationsRef.current);
    try {
      await renameChatConversation(id, title);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to rename";
      toast.error(message);
    }
  };

  const handleImagesChange = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    try {
      const newImages = await Promise.all(files.map(readImage));
      setImages((current) => [...current, ...newImages].slice(0, MAX_IMAGES));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to read image");
    }
  }, []);

  const handleRemoveImage = useCallback((id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
  }, []);

  const textFilePattern = /\.(txt|md|markdown|csv|tsv|json|jsonl|ya?ml|xml|html?|css|scss|jsx?|tsx?|py|rb|go|rs|java|kt|swift|c|h|cpp|cs|php|sh|bash|zsh|sql|r|lua|pl|ini|cfg|conf|env|log|toml|gitignore|dockerfile|makefile|svg)$/i;

  const isTextReadable = useCallback((file: File) => {
    if (file.type.startsWith("text/")) return true;
    if (/\.(json|xml|javascript|typescript|x-sh|x-python|x-yaml|sql|csv)$/i.test(file.type)) return true;
    return textFilePattern.test(file.name);
  }, [textFilePattern]);

  const handleFilesChange = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    try {
      const readable = files.filter((file) => {
        const ok = isTextReadable(file);
        if (!ok) toast.error(`${file.name}: unsupported type — use images or text/code files`);
        return ok;
      });
      const newFiles = await Promise.all(readable.map(readFileAsText));
      setAttachedFiles((current) => [...current, ...newFiles].slice(0, MAX_FILES));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to read file");
    }
  }, [isTextReadable]);

  const handleRemoveFile = useCallback((id: string) => {
    setAttachedFiles((current) => current.filter((file) => file.id !== id));
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runStream = useCallback(
    async (conversationId: string, assistantMessageId: string, messages: ChatMessage[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      setIsStreaming(true);
      shouldStickToBottomRef.current = true;
      setIsAwayFromLatest(false);

      let accumulated = "";
      const result = await streamChatCompletion({
        model,
        messages: toChatApiMessages(messages),
        reasoningEffort,
        gem: isGeminiModel ? gem : undefined,
        accountId: isGeminiModel ? accountId : undefined,
        tool: tool !== "auto" ? tool : undefined,
        signal: controller.signal,
        onDelta: (text) => {
          accumulated += text;
          void updateConversation(conversationId, (current) => {
            if (!current) return current;
            return {
              ...current,
              updatedAt: new Date().toISOString(),
              messages: current.messages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content + text }
                  : message,
              ),
            };
          }, false);
        },
      });

      abortRef.current = null;
      streamingRef.current = false;
      setIsStreaming(false);

      if (result.ok || result.error === "aborted") {
        const finalContent = accumulated;
        await updateConversation(conversationId, (current) => {
          if (!current) return current;
          return {
            ...current,
            updatedAt: new Date().toISOString(),
            messages: current.messages.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: finalContent }
                : message,
            ),
          };
        }, true);
        if (result.error === "aborted") {
          toast.info("Generation stopped");
        }
      } else {
        await updateConversation(conversationId, (current) => {
          if (!current) return current;
          return {
            ...current,
            updatedAt: new Date().toISOString(),
            messages: current.messages.map((message) =>
              message.id === assistantMessageId
                ? { ...message, error: result.error || "Request failed" }
                : message,
            ),
          };
        }, true);
        if (result.error) {
          toast.error(result.error);
        }
      }
    },
    [model, reasoningEffort, isGeminiModel, gem, accountId, updateConversation],
  );

  const runTool = useCallback(
    async (conversationId: string, assistantMessageId: string, userText: string, attachedImages: ComposerImage[]) => {
      streamingRef.current = true;
      setIsStreaming(true);
      shouldStickToBottomRef.current = true;
      setIsAwayFromLatest(false);
      const setAssistantContent = (content: string, error?: string) =>
        updateConversation(conversationId, (current) => {
          if (!current) return current;
          return {
            ...current,
            updatedAt: new Date().toISOString(),
            messages: current.messages.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content, error }
                : message,
            ),
          };
        }, true);

      try {
        let content = "";
        if (tool === "canvas" || tool === "infinite-canvas") {
          // Canvas tool: send AI prompt to generate HTML/CSS/JS code
          const canvasPrompt = [
            `You are a creative web developer. Generate a complete, working HTML/CSS/JS implementation based on this request:`,
            ``,
            `User request: ${userText}`,
            ``,
            `Rules:`,
            `- Output a single complete HTML file with embedded CSS and JS`,
            `- Use modern CSS (flexbox, grid, variables, animations)`,
            `- Make it responsive and visually polished`,
            `- Use realistic placeholder content (Lorem ipsum for text, placeholder.com for images)`,
            `- Include all necessary code in one HTML file with <style> and <script> tags`,
            `- Make it production-quality, not a prototype`,
            `- Output ONLY the code in a single \`\`\`html code block, no explanations`,
          ].join("\n");
          // Use streaming to generate canvas content
          const canvasController = new AbortController();
          let canvasContent = "";
          await streamChatCompletion({
            model,
            messages: [
              { role: "system", content: "You are an expert web developer. Generate complete, working HTML/CSS/JS code. Output ONLY the code in a single html code block." },
              { role: "user", content: canvasPrompt },
            ],
            reasoningEffort,
            tool: undefined,
            signal: canvasController.signal,
            onDelta: (text) => {
              canvasContent += text;
              void updateConversation(conversationId, (current) => {
                if (!current) return current;
                return {
                  ...current,
                  updatedAt: new Date().toISOString(),
                  messages: current.messages.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: canvasContent }
                      : msg,
                  ),
                };
              }, false);
            },
          });
          content = canvasContent;
          if (!content.trim()) {
            throw new Error("No canvas content generated");
          }
        } else if (tool === "image") {
          // Image tool: generate image
          const response = await generateImage(userText, toolImageModel, undefined, "auto", "url");
          const imageUrls = (response.data || []).map((item) =>
            item.url
              ? (item.url.startsWith("http") ? item.url : `${webConfig.apiUrl.replace(/\/$/, "")}${item.url}`)
              : item.b64_json
                ? `data:image/png;base64,${item.b64_json}`
                : "",
          );
          if (imageUrls.filter(Boolean).length === 0) {
            throw new Error("No image returned. The selected model/account may not support image generation.");
          }
          content = toolResultMarkdown(userText, imageUrls);
        } else if (tool === "video") {
          const response = await generateVideo(userText, toolVideoModel, 1, accountId || undefined);
          const baseUrl = webConfig.apiUrl.replace(/\/$/, "");
          content = (response.data || [])
            .map((video) => `[🎬 ${video.title || "Watch video"}](${baseUrl}${video.url})${video.thumbnail ? `\n![thumbnail](${baseUrl}${video.thumbnail})` : ""}`)
            .join("\n\n");
        } else if (tool === "research") {
          const result = await runGeminiDeepResearch(userText, 600);
          content = `# ${result.result.title}\n\n${result.result.report}`;
        }
        if (!content.trim()) {
          throw new Error("No result returned");
        }
        await setAssistantContent(content);
        // Confetti on image/video generation success
        if (tool === "image" || tool === "video") {
          triggerConfetti();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool failed";
        toast.error(message);
        await setAssistantContent("", message);
      } finally {
        streamingRef.current = false;
        setIsStreaming(false);
      }
    },
    [tool, toolImageModel, toolVideoModel, accountId, updateConversation],
  );

  const handleSubmit = async () => {
    const text = input.trim();
    if ((!text && images.length === 0 && attachedFiles.length === 0) || streamingRef.current) {
      return;
    }

    // Build file-content blocks so every provider can read the attachments
    const fileTextParts: Array<{ type: "text"; text: string }> = attachedFiles.map((file) => ({
      type: "text" as const,
      text: `[Attached file: ${file.name}]\n\`\`\`\n${file.text}\n\`\`\``,
    }));

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content:
        images.length > 0 || fileTextParts.length > 0
          ? ([
              ...(text ? [{ type: "text" as const, text }] : []),
              ...fileTextParts,
              ...images.map((image) => ({
                type: "image_url" as const,
                image_url: { url: image.dataUrl },
              })),
            ] satisfies ChatContentPart[])
          : text,
      createdAt: now,
    };
    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      content: "",
      createdAt: now,
    };

    const conversationId = selectedConversationId ?? createId();
    const baseConversation: ChatConversation = selectedConversation
      ? {
          ...selectedConversation,
          updatedAt: now,
          messages: [...selectedConversation.messages, userMessage, assistantMessage],
        }
      : {
          id: conversationId,
          title: buildConversationTitle(text || "New chat"),
          createdAt: now,
          updatedAt: now,
          messages: [userMessage, assistantMessage],
        };

    shouldStickToBottomRef.current = true;
    setSelectedConversationId(conversationId);
    setInput("");
    setImages([]);
    setAttachedFiles([]);
    await persistConversation(baseConversation);

    if (tool !== "auto" && tool !== "anti-slop") {
      void runTool(conversationId, assistantMessage.id, text || "Generate", images);
    } else {
      void runStream(conversationId, assistantMessage.id, baseConversation.messages);
    }
  };

  const hasMessages = Boolean(selectedConversation && selectedConversation.messages.length > 0);

  return (
    <>
      <section className="mx-auto grid h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom,0px))] min-h-0 w-full overflow-hidden px-0 sm:h-[calc(100dvh-3rem)] sm:pb-6">
        <div className="flex min-h-0 flex-col gap-2 sm:gap-4">
          <div className="flex items-center gap-2 px-1 py-1 lg:hidden">
            <div className="min-w-0 flex-1 truncate pl-1 text-sm font-semibold text-stone-800 dark:text-stone-200">
              {selectedConversation?.title || 'New chat'}
              {tool === 'anti-slop' && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Shield className="size-3" /> Anti-Slop
                </span>
              )}
            </div>
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-stone-900 px-3 text-sm font-medium text-white shadow-sm transition-all active:scale-95 dark:bg-stone-100 dark:text-stone-900"
              onClick={handleCreateDraft}
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">New</span>
            </button>
            {selectedConversation && (
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white/85 text-stone-500 shadow-sm transition-all active:scale-95 hover:bg-stone-100 hover:text-stone-700 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                onClick={() => shareConversation(selectedConversation)}
                aria-label="Share conversation"
                title="Share / Export"
              >
                <Share2 className="size-4" />
              </button>
            )}
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white/85 text-stone-500 shadow-sm transition-all active:scale-95 disabled:opacity-40 dark:border-white/10 dark:bg-white/5"
              onClick={() => setDeleteConfirm({ id: "__all__" })}
              disabled={conversations.length === 0}
              aria-label="Clear all chats"
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            {/* Desktop share button — top right corner */}
            {selectedConversation && hasMessages && (
              <button
                type="button"
                className="absolute top-3 right-3 z-10 hidden h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white/90 text-stone-400 shadow-sm backdrop-blur transition-all hover:bg-stone-100 hover:text-stone-600 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-300"
                onClick={() => shareConversation(selectedConversation!)}
                title="Share / Export conversation"
              >
                <Share2 className="size-4" />
              </button>
            )}
            <div
              ref={messagesViewportRef}
              onScroll={handleMessagesScroll}
              className="hide-scrollbar h-full overscroll-contain overflow-y-auto px-1 py-2 sm:px-4 sm:py-4"
              style={{ contain: "layout style paint" }}
            >
              {hasMessages && selectedConversation ? (
                <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 py-2 sm:gap-7">
                  {/* Files / Attachments panel */}
                  {(() => {
                    const allImages: { url: string; from: string }[] = [];
                    for (const msg of selectedConversation.messages) {
                      if (msg.role === "user" && Array.isArray(msg.content)) {
                        for (const part of msg.content) {
                          if (part.type === "image_url" && part.image_url.url) {
                            allImages.push({ url: part.image_url.url, from: msg.id });
                          }
                        }
                      }
                    }
                    if (allImages.length === 0) return null;
                    return (
                      <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                          <Paperclip className="size-3" />
                          Attachments ({allImages.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {allImages.map((img, i) => (
                            <div key={i} className="group/img relative">
                              <img
                                src={img.url}
                                alt="Attachment"
                                className="h-14 w-14 rounded-lg border border-stone-200 object-cover transition hover:scale-105 dark:border-white/10 sm:h-16 sm:w-16"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const a = document.createElement("a");
                                  a.href = img.url;
                                  a.download = `attachment-${i + 1}.png`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                }}
                                className="absolute bottom-0.5 right-0.5 inline-flex size-4 items-center justify-center rounded bg-black/50 text-white opacity-0 backdrop-blur-sm transition group-hover/img:opacity-100"
                                title="Download"
                              >
                                <Download className="size-2" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {selectedConversation.messages.map((message, index) => {
                    const isLast = index === selectedConversation.messages.length - 1;
                    const isAssistantStreaming = isLast && message.role === "assistant" && isStreaming;
                    // Show date separator when date changes between messages
                    const prevMessage = index > 0 ? selectedConversation.messages[index - 1] : null;
                    const showDateSep = !prevMessage ||
                      new Date(message.createdAt).toDateString() !== new Date(prevMessage.createdAt).toDateString();
                    // Check if this assistant message has code blocks (canvas mode)
                    const isCanvasMessage = (tool === "canvas" || tool === "infinite-canvas") &&
                      message.role === "assistant" &&
                      typeof message.content === "string" &&
                      (message.content.includes("```html") || message.content.includes("```css") || message.content.includes("```js") || message.content.includes("```javascript"));
                    return (
                      <React.Fragment key={message.id}>
                        {showDateSep && <DateSeparator date={message.createdAt} />}
                        {isCanvasMessage ? (
                          <CanvasView
                            responseText={typeof message.content === "string" ? message.content : ""}
                            isStreaming={isAssistantStreaming}
                            title={selectedConversation.title}
                          />
                        ) : (
                          <ChatMessageView
                            message={message}
                            isStreaming={Boolean(isAssistantStreaming)}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                  {tool === 'canvas' || tool === 'infinite-canvas' ? (
                    <>
                      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-700 text-white shadow-lg animate-float">
                        <Compass className="size-6" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg dark:text-stone-100">
                          Canvas Mode
                        </h2>
                        <p className="text-xs leading-5 text-stone-500 sm:text-sm sm:leading-6">
                          Describe what you want to build — landing page, dashboard, component, app UI.
                          AI generates HTML/CSS/JS with a live preview.
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                        {["Build a pricing page with 3 tiers", "Create a dark mode dashboard", "Design a portfolio with animations", "Make a responsive nav bar"].map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setInput(suggestion)}
                            className="cursor-pointer rounded-full border border-blue-200 bg-blue-50/90 px-3 py-1.5 text-[11px] font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-900 active:scale-95 sm:px-3.5 sm:text-xs dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : tool === 'anti-slop' ? (
                    <>
                      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-lg animate-float">
                        <Shield className="size-6" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg dark:text-stone-100">
                          Anti-Slop Mode Active
                        </h2>
                        <p className="text-xs leading-5 text-stone-500 sm:text-sm sm:leading-6">
                          AI will avoid generic patterns, fake metrics, and buzzwords.
                          Responses are crafted, not generated.
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                        {["Design a landing page for a SaaS product", "Write product copy that doesn't sound like AI", "Create a dashboard with real data", "Build a mobile-first signup flow"].map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setInput(suggestion)}
                            className="cursor-pointer rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-[11px] font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-900 active:scale-95 sm:px-3.5 sm:text-xs dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-stone-800 to-stone-950 text-white shadow-lg dark:from-stone-200 dark:to-stone-400 dark:text-stone-950 animate-float">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-6">
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        </svg>
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg dark:text-stone-100">
                          Start a new chat
                        </h2>
                        <p className="text-xs leading-5 text-stone-500 sm:text-sm sm:leading-6">
                          Ask anything — text, code, images. Responses stream in real time.
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                        {["Write a short story", "Explain a concept simply", "Help me debug code"].map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setInput(suggestion)}
                            className="cursor-pointer rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-stone-600 transition hover:border-stone-300 hover:bg-white hover:text-stone-900 active:scale-95 sm:px-3.5 sm:text-xs dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:bg-white/[0.08]"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {isAwayFromLatest ? (
              <button
                type="button"
                aria-label="Scroll to latest"
                title="Scroll to latest"
                onClick={() => scrollToLatest("smooth")}
                className="absolute bottom-4 left-1/2 z-20 inline-flex size-11 -translate-x-1/2 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-700 shadow-lg shadow-stone-200/60 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:border-white/10 dark:bg-stone-800/95 dark:text-stone-100 dark:shadow-black/40 dark:hover:bg-stone-700"
              >
                <ArrowDown className="size-5" />
              </button>
            ) : null}
          </div>

          <ChatComposer
            input={input}
            model={model}
            models={models}
            reasoningEffort={reasoningEffort}
            isGeminiModel={isGeminiModel}
            gem={gem}
            gems={gems}
            accountId={accountId}
            accounts={accounts}
            tool={tool}
            images={images}
            files={attachedFiles}
            isStreaming={isStreaming}
            textareaRef={textareaRef}
            onInputChange={setInput}
            onModelChange={setModel}
            onReasoningEffortChange={setReasoningEffort}
            onGemChange={setGem}
            onAccountChange={setAccountId}
            onToolChange={setTool}
            onImagesChange={handleImagesChange}
            onRemoveImage={handleRemoveImage}
            onFilesChange={handleFilesChange}
            onRemoveFile={handleRemoveFile}
            onSubmit={handleSubmit}
            onStop={handleStop}
          />
        </div>
      </section>

      {deleteConfirm ? (
        <Dialog open onOpenChange={(open) => (!open ? setDeleteConfirm(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6 sm:max-w-sm">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-base">
                {deleteConfirm.id === "__all__" ? "Clear Chat History" : "Delete Chat"}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6">
                {deleteConfirm.id === "__all__"
                  ? "Delete all chat history? This cannot be undone."
                  : "Delete this chat? This cannot be undone."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" className="h-9 rounded-xl" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                className="h-9 rounded-xl bg-stone-900 text-white hover:bg-stone-800"
                onClick={() => {
                  const id = deleteConfirm.id;
                  setDeleteConfirm(null);
                  if (id === "__all__") {
                    void handleClearHistory();
                  } else {
                    void handleDeleteConversation(id);
                  }
                }}
              >
                Confirm
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

export default function ChatPage() {
  const { isCheckingAuth, session } = useAuthGuard();

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return <ChatPageContent />;
}
