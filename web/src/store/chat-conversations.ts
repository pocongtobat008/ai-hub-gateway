"use client";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string | ChatContentPart[];
  createdAt: string;
  error?: string;
};

export type ChatConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

// ── API helpers ──────────────────────────────────────────────────────────────

function apiBase(): string {
  try {
    return (window as any).__BECOMEAI_API_URL__ || window.location.origin;
  } catch {
    return "";
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text().catch(() => "error")}`);
  }
  return res.json();
}

// ── normalize ────────────────────────────────────────────────────────────────

function normalizeMessage(message: ChatMessage): ChatMessage {
  let content: string | ChatContentPart[] = message.content;
  if (Array.isArray(content)) {
    content = content.filter(
      (part) =>
        (part.type === "text" && part.text.trim().length > 0) ||
        (part.type === "image_url" && part.image_url.url.length > 0),
    );
    if (content.length === 0) {
      content = "";
    } else if (content.length === 1 && content[0].type === "text") {
      content = content[0].text;
    }
  } else {
    content = String(content ?? "");
  }

  return {
    id: String(message.id || `${Date.now()}`),
    role: message.role === "assistant" ? "assistant" : "user",
    content,
    createdAt: String(message.createdAt || new Date().toISOString()),
    error: typeof message.error === "string" && message.error ? message.error : undefined,
  };
}

function normalizeConversation(raw: ChatConversation): ChatConversation {
  const messages = Array.isArray(raw.messages)
    ? raw.messages
        .map(normalizeMessage)
        .filter((message) => (typeof message.content === "string" ? message.content.length > 0 : message.content.length > 0) || Boolean(message.error))
    : [];

  return {
    id: String(raw.id || `${Date.now()}`),
    title: String(raw.title || "New chat"),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
    messages,
  };
}

// ── public API ───────────────────────────────────────────────────────────────

export async function listChatConversations(): Promise<ChatConversation[]> {
  try {
    const data = await apiFetch("/api/conversations");
    return (data.items || []).map(normalizeConversation);
  } catch {
    // Fallback to empty if backend unavailable
    return [];
  }
}

export async function saveChatConversation(conversation: ChatConversation): Promise<void> {
  const normalized = normalizeConversation(conversation);
  await apiFetch("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ conversation: normalized }),
  });
}

export async function renameChatConversation(id: string, title: string): Promise<void> {
  await apiFetch(`/api/conversations/${encodeURIComponent(id)}/rename`, {
    method: "PUT",
    body: JSON.stringify({ title }),
  });
}

export async function deleteChatConversation(id: string): Promise<void> {
  await apiFetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function clearChatConversations(): Promise<void> {
  await apiFetch("/api/conversations", {
    method: "DELETE",
  });
}

// ── message utilities ────────────────────────────────────────────────────────

export function messageText(message: ChatMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function messageImages(message: ChatMessage): string[] {
  if (!Array.isArray(message.content)) {
    return [];
  }
  return message.content
    .filter((part): part is { type: "image_url"; image_url: { url: string } } => part.type === "image_url")
    .map((part) => part.image_url.url);
}

export function toChatApiMessages(messages: ChatMessage[]): Array<{
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}> {
  return messages
    .filter((message) => {
      if (typeof message.content === "string") {
        return message.content.trim().length > 0;
      }
      return message.content.length > 0;
    })
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}
