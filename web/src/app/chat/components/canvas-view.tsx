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

// ── Extract HTML/CSS/JS from AI response ───────────────────────────────────// Languages that can be wrapped in HTML for iframe preview
const PREVIEWABLE_LANGS = new Set([
  "html", "htm", "xml", "svg",
  "css", "scss", "less", "sass",
  "js", "javascript", "jsx", "tsx", "ts", "typescript",
  "vue", "svelte",
  "py", "python", "rb", "ruby",
  "json", "yaml", "yml",
  "markdown", "md",
]);

// Check if a language can be previewed in an iframe
export function isPreviewableCode(lang: string): boolean {
  return PREVIEWABLE_LANGS.has(lang.toLowerCase());
}

// Wrap non-HTML code in a previewable HTML shell
function wrapCodeAsPreview(lang: string, code: string): string {
  const l = lang.toLowerCase();

  // JSX/TSX/React — render in browser with Babel standalone
  if (["jsx", "tsx", "react"].includes(l)) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="img-src * data: blob:; style-src * inline 'unsafe-eval'; script-src * inline 'unsafe-eval' 'unsafe-inline';">
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fafafa; }
    #root { width: 100%; }
    .error { color: #dc2626; padding: 20px; font-family: monospace; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    try {
      const Root = (${code});
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(Root));
    } catch(e) {
      document.getElementById('root').innerHTML = '<div class="error">' + e.message + '</div>';
    }
  <\/script>
</body>
</html>`;
  }

  // Vue
  if (l === "vue") {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="img-src * data: blob:; style-src * inline; script-src * inline 'unsafe-eval';">
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    try {
      ${code}
    } catch(e) {
      document.getElementById('app').innerHTML = '<div style="color:#dc2626;padding:20px;font-family:monospace;">' + e.message + '</div>';
    }
  <\/script>
</body>
</html>`;
  }

  // Svelte
  if (l === "svelte") {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .svelte-note { padding: 20px; color: #666; background: #f5f5f5; border-radius: 8px; margin: 20px; }
  </style>
</head>
<body>
  <div class="svelte-note">
    <h3>Svelte Component</h3>
    <p>Svelte requires compilation. Below is the source code:</p>
    <pre style="margin-top:12px;padding:12px;background:#1e1e1e;color:#d4d4d4;border-radius:8px;overflow:auto;font-size:13px;">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  </div>
</body>
</html>`;
  }

  // Python — show code with syntax highlighting (no runtime)
  if (["py", "python"].includes(l)) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/python.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 16px; background: #1e1e1e; }
    pre { border-radius: 12px; overflow: auto; }
    code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <pre><code class="language-python">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
  <script>hljs.highlightAll();<\/script>
</body>
</html>`;
  }

  // Ruby
  if (["rb", "ruby"].includes(l)) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/ruby.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { padding: 16px; background: #1e1e1e; }
    pre { border-radius: 12px; overflow: auto; }
    code { font-family: 'SF Mono', monospace; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <pre><code class="language-ruby">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
  <script>hljs.highlightAll();<\/script>
</body>
</html>`;
  }

  // JSON
  if (l === "json") {
    try {
      const formatted = JSON.stringify(JSON.parse(code), null, 2);
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/json.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { padding: 16px; background: #1e1e1e; }
    pre { border-radius: 12px; overflow: auto; }
    code { font-family: 'SF Mono', monospace; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <pre><code class="language-json">${formatted.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
  <script>hljs.highlightAll();<\/script>
</body>
</html>`;
    } catch {
      // Not valid JSON, show raw
    }
  }

  // YAML/YML
  if (["yaml", "yml"].includes(l)) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/yaml.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { padding: 16px; background: #1e1e1e; }
    pre { border-radius: 12px; overflow: auto; }
    code { font-family: 'SF Mono', monospace; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <pre><code class="language-yaml">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
  <script>hljs.highlightAll();<\/script>
</body>
</html>`;
  }

  // Markdown
  if (["markdown", "md"].includes(l)) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; max-width: 800px; margin: 0 auto; line-height: 1.7; color: #1a1a1a; }
    h1,h2,h3 { margin: 1em 0 0.5em; }
    p { margin: 0.5em 0; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 12px; overflow: auto; }
    pre code { background: none; color: inherit; }
    blockquote { border-left: 4px solid #ddd; padding-left: 16px; color: #666; margin: 1em 0; }
    table { border-collapse: collapse; margin: 1em 0; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; }
    img { max-width: 100%; border-radius: 8px; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <script>
    document.body.innerHTML = marked.parse(${JSON.stringify(code)});
  <\/script>
</body>
</html>`;
  }

  // CSS/SCSS/LESS — wrap in HTML preview
  if (["css", "scss", "less", "sass"].includes(l)) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="img-src * data: blob:; style-src * inline;">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    ${code}
  </style>
</head>
<body>
  <div style="padding:20px;">
    <h2 style="margin-bottom:16px;color:#333;">CSS Preview</h2>
    <div class="preview-grid" style="display:grid;gap:16px;">
      <div><strong>Buttons</strong><br><button class="btn">Button</button> <button class="btn btn-primary">Primary</button></div>
      <div><strong>Card</strong><br><div class="card"><h3>Card Title</h3><p>Card content goes here.</p></div></div>
      <div><strong>Input</strong><br><input class="input" placeholder="Type here..." style="padding:8px 12px;border:1px solid #ccc;border-radius:6px;width:200px;"></div>
      <div><strong>Typography</strong><br><h1>H1 Heading</h1><h2>H2 Heading</h2><p>Paragraph text with <a href="#">link</a></p></div>
    </div>
  </div>
</body>
</html>`;
  }

  // For other JS/TS — wrap as a script in HTML with console capture
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="img-src * data: blob:; style-src * inline; script-src * inline 'unsafe-eval';">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 16px; background: #fafafa; }
    .output { padding: 16px; background: white; border-radius: 12px; border: 1px solid #e5e7eb; min-height: 100px; }
    .error { color: #dc2626; padding: 12px; background: #fef2f2; border-radius: 8px; font-family: monospace; white-space: pre-wrap; margin: 8px 0; }
    .info { color: #6b7280; padding: 12px; background: #f9fafb; border-radius: 8px; font-size: 13px; margin: 8px 0; }
    .label { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px; overflow: auto; font-size: 13px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="label">Console Output</div>
  <div id="output" class="output"><div class="info">Running code...</div></div>
  <div class="label" style="margin-top:16px;">Source Code</div>
  <pre id="source"></pre>
  <script>
    const out = document.getElementById('output');
    const src = document.getElementById('source');
    src.textContent = ${JSON.stringify(code)};
    let hasOutput = false;
    const _log = console.log;
    const _err = console.error;
    const _warn = console.warn;
    console.log = (...a) => { _log(...a); hasOutput = true; out.innerHTML += '<div style="padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">' + a.map(x => { try { return typeof x === 'object' ? JSON.stringify(x,null,2) : String(x); } catch { return String(x); } }).join(' ') + '</div>'; };
    console.error = (...a) => { _err(...a); hasOutput = true; out.innerHTML += '<div class="error">' + a.map(String).join(' ') + '</div>'; };
    console.warn = (...a) => { _warn(...a); hasOutput = true; out.innerHTML += '<div style="color:#d97706;padding:4px 0;font-size:13px;">' + a.map(String).join(' ') + '</div>'; };
    try {
      ${code}
      // Check if output was produced after a tick
      setTimeout(() => {
        if (!hasOutput) {
          out.innerHTML = '<div class="info">No console output. Code executed successfully. Add console.log() to see output.</div>';
        }
      }, 100);
    } catch(e) {
      out.innerHTML = '<div class="error">Error: ' + e.message + (e.stack ? '\n' + e.stack.split('\n').slice(0,5).join('\n') : '') + '</div>';
    }
  <\/script>
</body>
</html>`;
}

function extractCodeBlocks(text: string): { html: string; css: string; js: string; raw: string; detectedLang: string } {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let html = "";
  let css = "";
  let js = "";
  let raw = text;
  let detectedLang = "";

  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const lang = (match[1] || "").toLowerCase();
    const code = match[2].trim();
    detectedLang = lang;
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
    const trimmed = text.trim();
    if (
      trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") ||
      trimmed.startsWith("<div") || trimmed.startsWith("<section") ||
      trimmed.startsWith("<!")
    ) {
      html = trimmed;
    }
  }

  return { html, css, js, raw, detectedLang };
}

function buildPreviewHtml(extracted: { html: string; css: string; js: string; detectedLang?: string }): string {
  const { html, css, js, detectedLang } = extracted;

  // If we have a non-HTML language that needs wrapping
  if (!html && !css && detectedLang && ["jsx", "tsx", "react", "vue", "svelte", "py", "python", "rb", "ruby", "json", "yaml", "yml", "markdown", "md", "js", "javascript", "ts", "typescript", "css", "scss", "less"].includes(detectedLang)) {
    const code = js || css || "";
    if (code) return wrapCodeAsPreview(detectedLang, code);
  }

  // If we have a full HTML document, use it as-is but inject CSS/JS
  if (html.includes("<!DOCTYPE") || html.includes("<html")) {
    let doc = html;
    // Inject CSP to allow images from any source
    const csp = '<meta http-equiv="Content-Security-Policy" content="img-src * data: blob:; style-src * inline; script-src * inline;">';
    if (doc.includes("<head>")) {
      doc = doc.replace("<head>", `<head>\n${csp}`);
    } else if (doc.includes("<!DOCTYPE")) {
      doc = doc.replace(/(<!DOCTYPE[^>]*>)/, `$1\n<head>${csp}</head>`);
    }
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
  <meta http-equiv="Content-Security-Policy" content="img-src * data: blob:; style-src * inline; script-src * inline;">
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
      ? { html: editedHtml, css: editedCss, js: editedJs, detectedLang: extracted.detectedLang }
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
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                title="Canvas Preview"
                loading="lazy"
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
