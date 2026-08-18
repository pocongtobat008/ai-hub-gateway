"use client";

import localforage from "localforage";

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

const chatConversationStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "chat_conversations",
});

const CHAT_CONVERSATIONS_KEY = "items";
let chatConversationWriteQueue: Promise<void> = Promise.resolve();

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

function sortChatConversations(conversations: ChatConversation[]): ChatConversation[] {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function queueChatConversationWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = chatConversationWriteQueue.then(operation);
  chatConversationWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readStoredChatConversations(): Promise<ChatConversation[]> {
  const items =
    (await chatConversationStorage.getItem<ChatConversation[]>(CHAT_CONVERSATIONS_KEY)) || [];
  return items.map(normalizeConversation);
}

export async function listChatConversations(): Promise<ChatConversation[]> {
  return sortChatConversations(await readStoredChatConversations());
}

export async function saveChatConversation(conversation: ChatConversation): Promise<void> {
  await queueChatConversationWrite(async () => {
    const items = await readStoredChatConversations();
    const nextConversation = normalizeConversation(conversation);
    const nextItems = sortChatConversations([
      nextConversation,
      ...items.filter((item) => item.id !== nextConversation.id),
    ]);
    await chatConversationStorage.setItem(CHAT_CONVERSATIONS_KEY, nextItems);
  });
}

export async function renameChatConversation(id: string, title: string): Promise<void> {
  await queueChatConversationWrite(async () => {
    const items = await readStoredChatConversations();
    const target = items.find((item) => item.id === id);
    if (!target) return;
    const updated = { ...target, title, updatedAt: new Date().toISOString() };
    const nextItems = sortChatConversations([
      updated,
      ...items.filter((item) => item.id !== id),
    ]);
    await chatConversationStorage.setItem(CHAT_CONVERSATIONS_KEY, nextItems);
  });
}

export async function deleteChatConversation(id: string): Promise<void> {
  await queueChatConversationWrite(async () => {
    const items = await readStoredChatConversations();
    await chatConversationStorage.setItem(
      CHAT_CONVERSATIONS_KEY,
      items.filter((item) => item.id !== id),
    );
  });
}

export async function clearChatConversations(): Promise<void> {
  await queueChatConversationWrite(async () => {
    await chatConversationStorage.removeItem(CHAT_CONVERSATIONS_KEY);
  });
}

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
