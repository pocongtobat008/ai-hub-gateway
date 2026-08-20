import webConfig from "@/constants/common-env";
import { getStoredAuthKey } from "@/store/auth";
import type { ChatContentPart } from "@/store/chat-conversations";

export type ChatApiMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};

export type StreamResult = {
  ok: boolean;
  error?: string;
};

type StreamOptions = {
  model: string;
  messages: ChatApiMessage[];
  reasoningEffort?: string;
  gem?: string;
  accountId?: string;
  tool?: string;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
};

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const value = payload as { detail?: unknown; error?: unknown; message?: unknown };
  if (typeof value.message === "string") {
    return value.message;
  }
  if (typeof value.error === "string") {
    return value.error;
  }
  if (typeof value.detail === "string") {
    return value.detail;
  }
  if (value.detail && typeof value.detail === "object") {
    const detail = value.detail as { error?: unknown };
    if (typeof detail.error === "string") {
      return detail.error;
    }
    if (detail.error && typeof detail.error === "object") {
      const nested = detail.error as { message?: string };
      if (typeof nested.message === "string") {
        return nested.message;
      }
    }
  }
  if (value.error && typeof value.error === "object") {
    const nested = value.error as { message?: string };
    if (typeof nested.message === "string") {
      return nested.message;
    }
  }
  return "";
}

// System context message to maximize model understanding
const SYSTEM_CONTEXT = `You are an AI assistant powered by BecomeAI. You have access to the full conversation history above. Always maintain context from previous messages when responding. If the user refers to something from earlier in the conversation, use that context to provide accurate and relevant responses. Be helpful, concise, and maintain a natural conversational flow.`;

// Cache for anti-slop rules to avoid repeated fetches
let antiSlopCache: string | null = null;

async function getAntiSlopPrompt(): Promise<string> {
  if (antiSlopCache) return antiSlopCache;
  try {
    const authKey = await getStoredAuthKey();
    const baseUrl = webConfig.apiUrl.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/api/antislop/rules`, {
      headers: { Authorization: `Bearer ${authKey || ''}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.prompt) {
        antiSlopCache = String(data.prompt);
        return antiSlopCache;
      }
    }
  } catch {
    // ignore
  }
  // Fallback: concise rules inline
  return `# Anti-Slop Active

Follow these rules strictly:
1. No decoration without purpose — every visual element must solve a problem
2. No AI-typical patterns — no "Empower your...", no "Seamless...", no "Revolutionize..."
3. No fake metrics — never invent stats or percentages
4. No generic icons — use specific icons that match the content
5. No placeholder content — real copy, real data, real examples
6. Vary sentence rhythm — mix short and long sentences
7. Use concrete language — "Users click" not "The button is clicked"
8. Show, don't tell — demonstrate capability, don't claim it
9. No buzzwords — avoid: leverage, utilize, streamline, empower, revolutionize
10. Active voice — "We built this" not "This was built by us"`;
}

export async function streamChatCompletion(options: StreamOptions): Promise<StreamResult> {
  const { model, messages, reasoningEffort, gem, accountId, tool, signal, onDelta } = options;
  const authKey = await getStoredAuthKey();
  const baseUrl = webConfig.apiUrl.replace(/\/$/, "");

  // Build system message: inject anti-slop rules if tool is selected
  let systemContent = SYSTEM_CONTEXT;
  if (tool === "anti-slop") {
    const antislop = await getAntiSlopPrompt();
    systemContent = `${SYSTEM_CONTEXT}\n\n---\n\n${antislop}`;
  }

  // Prepend system context message if not already present
  const hasSystemMessage = messages.length > 0 && messages[0].role === "system";
  const messagesWithContext = hasSystemMessage
    ? messages
    : [{ role: "system" as const, content: systemContent }, ...messages];

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authKey}`,
      },
      body: JSON.stringify({
        model: model.trim() || "auto",
        messages: messagesWithContext,
        stream: true,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        ...(gem ? { gem } : {}),
        ...(accountId ? { account_id: accountId } : {}),
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "aborted" };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as unknown;
      message = extractErrorMessage(payload) || message;
    } catch {
      // ignore parse failure
    }
    return { ok: false, error: message };
  }

  if (!response.body) {
    return { ok: false, error: "No response body" };
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    // Non-streaming fallback (backend returned a plain JSON response)
    try {
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content || "";
      if (content) {
        onDelta(content);
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to read response" };
    }
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const dataLine = part
          .split("\n")
          .find((line) => line.startsWith("data:"));
        if (!dataLine) {
          continue;
        }
        const payload = dataLine.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          continue;
        }
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: unknown } }>;
            error?: unknown;
          };
          if (json.error) {
            return {
              ok: false,
              error: extractErrorMessage(json.error) || "Stream error",
            };
          }
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            onDelta(delta);
          }
        } catch {
          // Ignore malformed chunks
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "aborted" };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  return { ok: true };
}
