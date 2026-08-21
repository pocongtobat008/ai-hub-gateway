"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Extract HTML/CSS/JS from AI response ───────────────────────────────────

function extractCodeBlocks(text: string): { html: string; css: string; js: string; raw: string } {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let html = "";
  let css = "";
  let js = "";
  let raw = text;

  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const lang = (match[1] || "").toLowerCase();
    const code = match[2].trim();
    if (lang === "html" || lang === "htm") {
      html += (html ? "\n" : "") + code;
    } else if (lang === "css" || lang === "scss" || lang === "less") {
      css += (css ? "\n" : "") + code;
    } else if (lang === "js" || lang === "javascript" || lang === "typescript" || lang === "ts") {
      js += (js ? "\n" : "") + code;
    }
  }

  // If no specific code blocks found, try to extract from the whole response
  if (!html && !css && !js) {
    // Check if the whole text looks like HTML
    const trimmed = text.trim();
    if (
      trimmed.startsWith("<!DOCTYPE") ||
      trimmed.startsWith("<html") ||
      trimmed.startsWith("<div") ||
      trimmed.startsWith("<section") ||
      trimmed.startsWith("<!")
    ) {
      html = trimmed;
    }
  }

  return { html, css, js, raw };
}

function buildPreviewHtml(extracted: { html: string; css: string; js: string }): string {
  const { html, css, js } = extracted;

  // If we have a full HTML document, use it as-is but inject CSS/JS
  if (html.includes("<!DOCTYPE") || html.includes("<html")) {
    let doc = html;
    if (css && !doc.includes("</head>")) {
      doc = doc.replace("</head>", `<style>${css}</style></head>`);
    } else if (css) {
      doc = doc.replace("</head>", `<style>\n${css}\n</style>\n</head>`);
    }
    if (js && !doc.includes("</body>")) {
      doc = doc.replace("</body>", `<script>${js}</script></body>`);
    } else if (js) {
      doc = doc.replace("</body>", `<script>\n${js}\n</script>\n</body>`);
    }
    return doc;
  }

  // Otherwise, wrap in a full HTML document
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    ${css}
  </style>
</head>
<body>
  ${html || "<div style='padding:20px;text-align:center;color:#666;'>No HTML content generated</div>"}
  <script>${js}<\/script>
</body>
</html>`;
}

// ── Viewport size presets ──────────────────────────────────────────────────

type ViewportSize = "desktop" | "tablet" | "mobile";

const VIEWPORT_SIZES: Record<ViewportSize, { width: string; label: string; icon: React.ElementType }> = {
  desktop: { width: "100%", label: "Desktop", icon: Monitor },
  tablet: { width: "768px", label: "Tablet", icon: Tablet },
  mobile: { width: "375px", label: "Mobile", icon: Smartphone },
};

// ── Main Canvas View Component ─────────────────────────────────────────────

export type CanvasViewProps = {
  /** The raw AI response text containing code blocks */
  responseText: string;
  /** Whether the AI is still generating */
  isStreaming?: boolean;
  /** Optional title for the canvas */
  title?: string;
};

export function CanvasView({ responseText, isStreaming = false, title }: CanvasViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "code" | "split">("split");
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [editedHtml, setEditedHtml] = useState("");
  const [editedCss, setEditedCss] = useState("");
  const [editedJs, setEditedJs] = useState("");
  const [hasEdits, setHasEdits] = useState(false);

  // Extract code from AI response
  const extracted = useMemo(() => extractCodeBlocks(responseText), [responseText]);

  // Initialize edited values
  useEffect(() => {
    if (!hasEdits) {
      setEditedHtml(extracted.html);
      setEditedCss(extracted.css);
      setEditedJs(extracted.js);
    }
  }, [extracted, hasEdits]);

  // Build preview HTML
  const previewHtml = useMemo(() => {
    const source = hasEdits
      ? { html: editedHtml, css: editedCss, js: editedJs }
      : extracted;
    return buildPreviewHtml(source);
  }, [hasEdits, editedHtml, editedCss, editedJs, extracted]);

  // Update iframe when preview changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(previewHtml);
    doc.close();
  }, [previewHtml]);

  const handleRefresh = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(previewHtml);
    doc.close();
  }, [previewHtml]);

  const handleCopyCode = useCallback(async () => {
    const fullCode = [
      extracted.html ? `<!-- HTML -->\n${extracted.html}` : "",
      extracted.css ? `/* CSS */\n${extracted.css}` : "",
      extracted.js ? `// JavaScript\n${extracted.js}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(fullCode || extracted.raw);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      /* noop */
    }
  }, [extracted]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "canvas").replace(/[^a-z0-9]/gi, "-").slice(0, 40)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [previewHtml, title]);

  const handleCodeChange = useCallback(
    (field: "html" | "css" | "js", value: string) => {
      setHasEdits(true);
      if (field === "html") setEditedHtml(value);
      else if (field === "css") setEditedCss(value);
      else setEditedJs(value);
    },
    [],
  );

  const handleReset = useCallback(() => {
    setHasEdits(false);
    setEditedHtml(extracted.html);
    setEditedCss(extracted.css);
    setEditedJs(extracted.js);
  }, [extracted]);

  const hasCode = Boolean(extracted.html || extracted.css || extracted.js);
  const viewportSize = VIEWPORT_SIZES[viewport];

  // While streaming, show a loading state
  if (isStreaming && !hasCode) {
    return (
      <div className="my-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <RefreshCw className="size-4 animate-spin" />
          Generating canvas...
        </div>
      </div>
    );
  }

  if (!hasCode) return null;

  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/10 dark:bg-stone-900",
        isFullscreen && "fixed inset-4 z-50",
      )}
    >
      {/* Canvas Header */}
      <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-stone-500" />
          <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
            {title || "Canvas"}
          </span>
          {hasEdits && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Edited
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Tab buttons */}
          <div className="flex rounded-lg bg-stone-100 p-0.5 dark:bg-white/10">
            {(["preview", "code", "split"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                  activeTab === tab
                    ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white"
                    : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200",
                )}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Viewport selector (only in preview/split mode) */}
          {activeTab !== "code" && (
            <div className="ml-1 flex rounded-lg bg-stone-100 p-0.5 dark:bg-white/10">
              {(["desktop", "tablet", "mobile"] as const).map((size) => {
                const SizeIcon = VIEWPORT_SIZES[size].icon;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setViewport(size)}
                    className={cn(
                      "rounded-md p-1 transition-all",
                      viewport === size
                        ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white"
                        : "text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300",
                    )}
                    title={VIEWPORT_SIZES[size].label}
                  >
                    <SizeIcon className="size-3.5" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="ml-1 flex items-center gap-0.5">
            <button
              type="button"
              onClick={handleCopyCode}
              className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/10"
              title="Copy code"
            >
              {copiedCode ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/10"
              title="Download HTML"
            >
              <Download className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/10"
              title="Refresh preview"
            >
              <RefreshCw className="size-3.5" />
            </button>
            {hasEdits && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md px-2 py-1 text-[10px] font-medium text-amber-600 transition hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                title="Reset to original"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/10"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Canvas Body */}
      <div className={cn("flex", activeTab === "split" ? "h-[500px]" : "h-[600px]")}>
        {/* Preview Panel */}
        {(activeTab === "preview" || activeTab === "split") && (
          <div
            className={cn(
              "flex items-start justify-center overflow-auto bg-white dark:bg-stone-950",
              activeTab === "split" ? "w-1/2 border-r border-stone-200 dark:border-white/10" : "w-full",
            )}
          >
            <div
              className="transition-all duration-300"
              style={{
                width: viewportSize.width,
                maxWidth: "100%",
                height: "100%",
              }}
            >
              <iframe
                ref={iframeRef}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="Canvas Preview"
              />
            </div>
          </div>
        )}

        {/* Code Panel */}
        {(activeTab === "code" || activeTab === "split") && (
          <div
            className={cn(
              "flex flex-col overflow-hidden bg-stone-50 dark:bg-stone-900/50",
              activeTab === "split" ? "w-1/2" : "w-full",
            )}
          >
            {/* Code tabs */}
            <div className="flex border-b border-stone-200 bg-stone-100/80 px-2 py-1 dark:border-white/10 dark:bg-white/[0.03]">
              {extracted.html && (
                <button
                  type="button"
                  onClick={() => {
                    if (textareaRef.current) textareaRef.current.dataset.field = "html";
                  }}
                  className="rounded px-2 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-white/10"
                >
                  HTML {editedHtml !== extracted.html && "•"}
                </button>
              )}
              {extracted.css && (
                <button
                  type="button"
                  onClick={() => {
                    if (textareaRef.current) textareaRef.current.dataset.field = "css";
                  }}
                  className="rounded px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                >
                  CSS {editedCss !== extracted.css && "•"}
                </button>
              )}
              {extracted.js && (
                <button
                  type="button"
                  onClick={() => {
                    if (textareaRef.current) textareaRef.current.dataset.field = "js";
                  }}
                  className="rounded px-2 py-1 text-[11px] font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                >
                  JS {editedJs !== extracted.js && "•"}
                </button>
              )}
            </div>

            {/* Code editors */}
            <div className="flex-1 overflow-auto">
              {extracted.html && (
                <textarea
                  ref={textareaRef}
                  data-field="html"
                  value={editedHtml}
                  onChange={(e) => handleCodeChange("html", e.target.value)}
                  className="h-full w-full resize-none bg-transparent p-3 font-mono text-[13px] leading-5 text-stone-800 outline-none dark:text-stone-200"
                  spellCheck={false}
                  placeholder="<!-- HTML -->"
                />
              )}
              {extracted.css && !extracted.html && (
                <textarea
                  value={editedCss}
                  onChange={(e) => handleCodeChange("css", e.target.value)}
                  className="h-full w-full resize-none bg-transparent p-3 font-mono text-[13px] leading-5 text-stone-800 outline-none dark:text-stone-200"
                  spellCheck={false}
                  placeholder="/* CSS */"
                />
              )}
              {extracted.js && !extracted.html && !extracted.css && (
                <textarea
                  value={editedJs}
                  onChange={(e) => handleCodeChange("js", e.target.value)}
                  className="h-full w-full resize-none bg-transparent p-3 font-mono text-[13px] leading-5 text-stone-800 outline-none dark:text-stone-200"
                  spellCheck={false}
                  placeholder="// JavaScript"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
