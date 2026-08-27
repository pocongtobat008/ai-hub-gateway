"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
  Presentation,
  Eye,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isPreviewableCode } from "@/app/chat/components/canvas-view";
import hljs from "highlight.js/lib/core";

// Register commonly used languages (lightweight bundle)
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import php from "highlight.js/lib/languages/php";
import ruby from "highlight.js/lib/languages/ruby";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import diff from "highlight.js/lib/languages/diff";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("java", java);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("cs", csharp);
hljs.registerLanguage("php", php);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rb", ruby);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("diff", diff);

import { cn } from "@/lib/utils";
import { messageImages, messageText, type ChatMessage } from "@/store/chat-conversations";

// ── Copy to clipboard helper ───────────────────────────────────────────────

function useCopyToClipboard() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  return { copiedId, copy };
}

// ── Copy button component ──────────────────────────────────────────────────

function CopyButton({
  id,
  text,
  copiedId,
  copy,
  label,
  className,
}: {
  id: string;
  text: string;
  copiedId: string | null;
  copy: (id: string, text: string) => void;
  label?: string;
  className?: string;
}) {
  const isCopied = copiedId === id;
  return (
    <button
      type="button"
      onClick={() => copy(id, text)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
        isCopied
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 dark:bg-white/10 dark:text-stone-400 dark:hover:bg-white/15",
        className,
      )}
    >
      {isCopied ? (
        <>
          <Check className="size-3" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="size-3" />
          {label || "Copy"}
        </>
      )}
    </button>
  );
}

// ── Download helper ────────────────────────────────────────────────────────────────────

const CODE_EXTENSIONS: Record<string, string> = {
  python: "py", javascript: "js", typescript: "ts", jsx: "jsx", tsx: "tsx",
  html: "html", css: "css", scss: "scss", json: "json", yaml: "yml", yml: "yml",
  xml: "xml", markdown: "md", md: "md", bash: "sh", shell: "sh", sh: "sh",
  sql: "sql", go: "go", rust: "rs", java: "java", kotlin: "kt", swift: "swift",
  c: "c", cpp: "cpp", csharp: "cs", php: "php", ruby: "rb", toml: "toml",
  ini: "ini", dockerfile: "Dockerfile", csv: "csv", text: "txt", txt: "txt",
};

function codeFileName(language?: string) {
  const ext = language ? CODE_EXTENSIONS[language.toLowerCase()] : undefined;
  return ext ? `file-${Date.now()}.${ext}` : `code-${Date.now()}.txt`;
}

function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Format timestamp ───────────────────────────────────────────────────────

function formatTime(iso: string) {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

function formatDateSeparator(iso: string) {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

// ── Date separator between messages ────────────────────────────────────────

export function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
      <span className="shrink-0 text-[11px] font-medium text-stone-400 dark:text-stone-500">
        {formatDateSeparator(date)}
      </span>
      <div className="h-px flex-px bg-stone-200 dark:bg-white/10" />
    </div>
  );
}

// ── Markdown with enhanced code blocks ─────────────────────────────────────

function Markdown({ text, messageId }: { text: string; messageId: string }) {
  const { copiedId, copy } = useCopyToClipboard();

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ className, ...props }) => (
          <a
            className={cn(
              "font-medium text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900 dark:text-blue-300 dark:decoration-blue-700",
              className,
            )}
            target="_blank"
            rel="noreferrer"
            {...props}
          />
        ),
        h1: ({ className, ...props }) => (
          <h1 className={cn("mt-6 mb-3 text-2xl font-semibold tracking-tight text-stone-950 first:mt-0 dark:text-stone-50", className)} {...props} />
        ),
        h2: ({ className, ...props }) => (
          <h2 className={cn("mt-6 mb-3 border-b border-stone-200 pb-2 text-xl font-semibold tracking-tight text-stone-950 first:mt-0 dark:border-white/10 dark:text-stone-50", className)} {...props} />
        ),
        h3: ({ className, ...props }) => (
          <h3 className={cn("mt-5 mb-2 text-lg font-semibold text-stone-900 dark:text-stone-100", className)} {...props} />
        ),
        h4: ({ className, ...props }) => (
          <h4 className={cn("mt-4 mb-2 text-base font-semibold text-stone-900 dark:text-stone-100", className)} {...props} />
        ),
        p: ({ className, ...props }) => (
          <p className={cn("my-2 leading-7 text-stone-800 first:mt-0 last:mb-0 dark:text-stone-200", className)} {...props} />
        ),
        ul: ({ className, ...props }) => (
          <ul className={cn("my-2 list-disc space-y-1 pl-6 leading-7 text-stone-800 dark:text-stone-200", className)} {...props} />
        ),
        ol: ({ className, ...props }) => (
          <ol className={cn("my-2 list-decimal space-y-1 pl-6 leading-7 text-stone-800 dark:text-stone-200", className)} {...props} />
        ),
        li: ({ className, ...props }) => <li className={cn("", className)} {...props} />,
        blockquote: ({ className, ...props }) => (
          <blockquote className={cn("my-3 border-l-4 border-stone-300 bg-white/70 py-1 pr-4 pl-4 text-stone-700 dark:border-white/20 dark:bg-white/[0.04] dark:text-stone-300", className)} {...props} />
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className?.includes("language-");
          if (isInline) {
            return (
              <code
                className={cn(
                  "rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.85em] text-stone-800 dark:bg-white/10 dark:text-stone-100",
                  className,
                )}
                {...props}
              />
            );
          }
          return (
            <code className={cn("font-mono text-[13px]", className)} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ className, children, ...props }) => {
          let language = "";
          let codeText = "";
          const childArray = React.Children.toArray(children);
          for (const child of childArray) {
            if (React.isValidElement(child)) {
              const childProps = child.props as Record<string, unknown>;
              const childClassName = String(childProps.className || "");
              const langMatch = childClassName.match(/language-(\w+)/);
              if (langMatch) language = langMatch[1];
              const get_text = (node: React.ReactNode): string => {
                if (typeof node === "string") return node;
                if (typeof node === "number") return String(node);
                if (React.isValidElement(node)) {
                  const p = node.props as Record<string, unknown>;
                  return get_text(p.children as React.ReactNode);
                }
                if (Array.isArray(node)) return node.map(get_text).join("");
                return "";
              };
              codeText = get_text(childProps.children as React.ReactNode);
            }
          }
          // Fallback: extract from raw children if tree walk fails
          if (!codeText && typeof children === "string") {
            codeText = children;
          }
          const blockId = `${messageId}-code-${language}-${codeText.slice(0, 20)}`;

          // Syntax highlight the code
          const highlighted = React.useMemo(() => {
            if (!codeText) return null;
            try {
              if (language && hljs.getLanguage(language)) {
                return hljs.highlight(codeText, { language }).value;
              }
              return hljs.highlightAuto(codeText).value;
            } catch {
              return null;
            }
          }, [codeText, language]);

          return (
            <div className="my-3 rounded-xl border border-stone-200 dark:border-white/10 overflow-hidden">
              <div className="flex items-center justify-between border-b border-stone-200 bg-stone-100 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.06]">
                <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                  {language || "code"}
                </span>
                <div className="flex items-center gap-1">
                  <CopyButton
                    id={blockId}
                    text={codeText}
                    copiedId={copiedId}
                    copy={copy}
                    label="Copy"
                    className="!size-auto !px-2 !py-1 !rounded-md opacity-60 hover:opacity-100"
                  />
                  <button
                    type="button"
                    onClick={() => downloadUrl(`data:text/plain,${encodeURIComponent(codeText)}`, codeFileName(language))}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-stone-400 opacity-60 transition-all hover:bg-stone-200 hover:text-stone-600 hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-stone-300"
                    title="Download file"
                  >
                    <Download className="size-3.5" />
                  </button>
                  {language && isPreviewableCode(language) && (
                    <button
                      type="button"
                      onClick={() => {
                        // Open canvas preview with this code block
                        const canvasEvent = new CustomEvent("becomeai:preview-code", {
                          detail: { code: codeText, language },
                        });
                        window.dispatchEvent(canvasEvent);
                      }}
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-stone-400 opacity-60 transition-all hover:bg-emerald-50 hover:text-emerald-600 hover:opacity-100 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                      title="Preview in canvas"
                    >
                      <Eye className="size-3" />
                      Preview
                    </button>
                  )}
                </div>
              </div>
              <pre
                className={cn(
                  "hide-scrollbar overflow-x-auto bg-stone-50 p-4 text-[13px] leading-6 text-stone-800 dark:bg-black/40 dark:text-stone-100",
                  className,
                )}
                {...props}
              >
                {highlighted ? (
                  <code
                    className="font-mono"
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />
                ) : (
                  <code className="font-mono">{children}</code>
                )}
              </pre>
            </div>
          );
        },
        table: ({ className, ...props }) => (
          <div className="my-3 overflow-x-auto">
            <table className={cn("w-full border-collapse text-sm", className)} {...props} />
          </div>
        ),
        th: ({ className, ...props }) => (
          <th className={cn("border border-stone-200 bg-stone-50 px-3 py-1.5 text-left font-semibold dark:border-white/10 dark:bg-white/[0.04]", className)} {...props} />
        ),
        td: ({ className, ...props }) => (
          <td className={cn("border border-stone-200 px-3 py-1.5 dark:border-white/10", className)} {...props} />
        ),
        hr: ({ className, ...props }) => (
          <hr className={cn("my-4 border-stone-200 dark:border-white/10", className)} {...props} />
        ),
        img: ({ className, src, alt, ...props }) => (
          <div className="group/img relative my-3 inline-block">
            <img
              className={cn("max-w-full rounded-xl", className)}
              src={typeof src === "string" ? src : ""}
              alt={alt}
              {...props}
            />
            {typeof src === "string" && src && (
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover/img:opacity-100">
                <button
                  type="button"
                  onClick={() => downloadUrl(src, `image-${Date.now()}.png`)}
                  className="inline-flex size-7 items-center justify-center rounded-lg bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
                  title="Download image"
                >
                  <Download className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `/image`;
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-lg bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
                  title="Edit in Image Gen"
                >
                  <Edit3 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// ── Loading dots ───────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      <span className="size-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-stone-400" />
    </span>
  );
}

// ── User message — memoized to survive streaming re-renders ────────────────

const UserMessage = React.memo(function UserMessage({ message }: { message: ChatMessage }) {
  const text = messageText(message);
  const images = messageImages(message);
  const { copiedId, copy } = useCopyToClipboard();

  // Use ref as backup — survives React re-renders that might remount
  const expandedRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const isExpanded = expanded || expandedRef.current;

  const lines = useMemo(() => text.split("\n"), [text]);
  const isLong = useMemo(() => lines.length > 1 || text.length > 120, [lines, text]);
  // When collapsed: show first line, or first ~80 chars if single long line
  const collapsedText = useMemo(() => {
    if (lines.length > 1) return lines[0];
    return text.length > 80 ? text.slice(0, 80) + "…" : text;
  }, [lines, text]);
  const promptId = `prompt-${message.id}`;
  const timeStr = formatTime(message.createdAt);

  const toggleExpanded = useCallback(() => {
    const next = !expandedRef.current;
    expandedRef.current = next;
    setExpanded(next);
  }, []);

  return (
    <div className="flex justify-end gap-3 animate-message-appear">
      <div className="max-w-full sm:max-w-[75%]">
        {/* Image uploads */}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap justify-end gap-2">
            {images.map((url, index) => (
              <div key={`${message.id}-${index}`} className="group/img relative">
                <img
                  src={url}
                  alt=""
                  className="h-20 w-20 rounded-xl border border-stone-200 object-cover dark:border-white/10 sm:h-24 sm:w-24"
                />
                <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover/img:opacity-100">
                  <button
                    type="button"
                    onClick={() => downloadUrl(url, `upload-${index + 1}.png`)}
                    className="inline-flex size-5 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-sm"
                    title="Download"
                  >
                    <Download className="size-2.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Prompt bubble */}
        {text && (
          <div className="rounded-3xl rounded-br-lg bg-stone-950 px-4 py-2.5 text-[15px] leading-6 text-white shadow-sm dark:bg-white dark:text-stone-950 sm:px-5 sm:py-3">
            {isLong ? (
              <div>
                <div className="whitespace-pre-wrap">
                  {isExpanded ? text : collapsedText}
                </div>
                <button
                  type="button"
                  onClick={toggleExpanded}
                  className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-stone-400 transition hover:bg-white/10 hover:text-stone-200 dark:text-stone-500 dark:hover:bg-black/10 dark:hover:text-stone-400"
                >
                  {isExpanded ? (
                    <>
                      <ChevronDown className="size-3" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <ChevronRight className="size-3" />
                      Show more ({lines.length} lines)
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{text}</div>
            )}
          </div>
        )}

        {/* Actions row: copy + timestamp */}
        {text && (
          <div className="mt-1.5 flex items-center justify-end gap-2">
            <CopyButton
              id={promptId}
              text={text}
              copiedId={copiedId}
              copy={copy}
              label="Copy"
            />
            {timeStr && (
              <span className="text-[10px] text-stone-400 dark:text-stone-500 select-none">{timeStr}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ── Assistant message ──────────────────────────────────────────────────────

function AssistantMessage({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) {
  const text = messageText(message);
  const { copiedId, copy } = useCopyToClipboard();
  const responseId = `response-${message.id}`;
  const timeStr = formatTime(message.createdAt);

  return (
    <div className="flex gap-3 animate-message-appear group/msg">
      <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-950 text-[10px] font-bold text-white dark:bg-white dark:text-stone-950">
        AI
      </div>
      <div className="min-w-0 flex-1">
        {/* Response content */}
        <div className="overflow-hidden text-[15px] leading-6">
          {text ? (
            <Markdown text={text} messageId={message.id} />
          ) : isStreaming ? (
            <LoadingDots />
          ) : message.error ? null : null}
        </div>

        {/* Error */}
        {message.error && (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
            {message.error}
          </div>
        )}

        {/* Streaming indicator */}
        {isStreaming && text && (
          <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-stone-400">
            <LoaderCircle className="size-3 animate-spin" />
            Generating...
          </span>
        )}

        {/* Actions row: copy + download + export + timestamp */}
        {text && !isStreaming && (
          <div className="mt-2 flex items-center gap-1.5">
            <CopyButton
              id={responseId}
              text={text}
              copiedId={copiedId}
              copy={copy}
              label="Copy"
            />
            <button
              type="button"
              onClick={() => downloadUrl(`data:text/markdown,${encodeURIComponent(text)}`, `becomeai-response-${Date.now()}.md`)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-white/10 dark:hover:text-stone-300 min-h-[32px]"
              title="Download as Markdown"
            >
              <Download className="size-3" />
              .md
            </button>
            <button
              type="button"
              onClick={() => {
                const token = localStorage.getItem("auth_token");
                fetch("/api/docs/generate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ title: "Response", content: text, format: "docx" }),
                })
                  .then((r) => r.json())
                  .then((d) => {
                    if (d.ok && d.filename) downloadUrl(`/api/docs/download/${encodeURIComponent(d.filename)}`, d.filename);
                  })
                  .catch(() => {});
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-white/10 dark:hover:text-stone-300 min-h-[32px]"
              title="Export as Word"
            >
              <FileText className="size-3" />
              .docx
            </button>
            <button
              type="button"
              onClick={() => {
                const token = localStorage.getItem("auth_token");
                fetch("/api/docs/generate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ title: "Response", content: text, format: "pptx" }),
                })
                  .then((r) => r.json())
                  .then((d) => {
                    if (d.ok && d.filename) downloadUrl(`/api/docs/download/${encodeURIComponent(d.filename)}`, d.filename);
                  })
                  .catch(() => {});
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-white/10 dark:hover:text-stone-300 min-h-[32px]"
              title="Export as PowerPoint"
            >
              <Presentation className="size-3" />
              .pptx
            </button>
            {timeStr && (
              <span className="text-[10px] text-stone-400 dark:text-stone-500 select-none ml-1">{timeStr}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Exported component ─────────────────────────────────────────────────────

type ChatMessageViewProps = {
  message: ChatMessage;
  isStreaming: boolean;
};

export const ChatMessageView = React.memo(function ChatMessageView({ message, isStreaming }: ChatMessageViewProps) {
  if (message.role === "user") {
    return <UserMessage message={message} />;
  }
  return <AssistantMessage message={message} isStreaming={isStreaming} />;
});
