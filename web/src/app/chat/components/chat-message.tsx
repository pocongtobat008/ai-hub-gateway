"use client";

import { LoaderCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";
import { messageImages, messageText, type ChatMessage } from "@/store/chat-conversations";

function Markdown({ text }: { text: string }) {
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
          <p className={cn("my-3 leading-7 text-stone-800 first:mt-0 last:mb-0 dark:text-stone-200", className)} {...props} />
        ),
        ul: ({ className, ...props }) => (
          <ul className={cn("my-3 list-disc space-y-1.5 pl-6 leading-7 text-stone-800 dark:text-stone-200", className)} {...props} />
        ),
        ol: ({ className, ...props }) => (
          <ol className={cn("my-3 list-decimal space-y-1.5 pl-6 leading-7 text-stone-800 dark:text-stone-200", className)} {...props} />
        ),
        li: ({ className, ...props }) => <li className={cn("", className)} {...props} />,
        blockquote: ({ className, ...props }) => (
          <blockquote className={cn("my-4 border-l-4 border-stone-300 bg-white/70 py-2 pr-4 pl-4 text-stone-700 dark:border-white/20 dark:bg-white/[0.04] dark:text-stone-300", className)} {...props} />
        ),
        code: ({ className, ...props }) => (
          <code
            className={cn(
              "rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.88em] text-stone-800 dark:bg-white/10 dark:text-stone-100",
              className,
            )}
            {...props}
          />
        ),
        pre: ({ className, children, ...props }) => (
          <pre
            className={cn(
              "hide-scrollbar my-4 overflow-x-auto rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-[13px] leading-6 text-stone-800 dark:border-white/10 dark:bg-black/40 dark:text-stone-100",
              className,
            )}
            {...props}
          >
            {children}
          </pre>
        ),
        table: ({ className, ...props }) => (
          <div className="my-4 overflow-x-auto">
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
          <hr className={cn("my-5 border-stone-200 dark:border-white/10", className)} {...props} />
        ),
        img: ({ className, ...props }) => (
          <img className={cn("my-3 max-w-full rounded-xl", className)} {...props} />
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      <span className="size-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-stone-400" />
    </span>
  );
}

type ChatMessageViewProps = {
  message: ChatMessage;
  isStreaming: boolean;
};

export function ChatMessageView({ message, isStreaming }: ChatMessageViewProps) {
  const text = messageText(message);
  const images = messageImages(message);

  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[85%] sm:max-w-[75%]">
          {images.length > 0 ? (
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              {images.map((url, index) => (
                <img
                  key={`${message.id}-${index}`}
                  src={url}
                  alt=""
                  className="h-20 w-20 rounded-xl border border-stone-200 object-cover dark:border-white/10 sm:h-24 sm:w-24"
                />
              ))}
            </div>
          ) : null}
          {text ? (
            <div className="rounded-3xl rounded-br-lg bg-stone-950 px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap text-white shadow-sm dark:bg-white dark:text-stone-950 sm:px-5 sm:py-3">
              {text}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-950 text-[10px] font-bold text-white dark:bg-white dark:text-stone-950">
        AI
      </div>
      <div className="min-w-0 flex-1">
        <div className="overflow-hidden text-[15px] leading-6">
          {text ? (
            <Markdown text={text} />
          ) : isStreaming ? (
            <LoadingDots />
          ) : message.error ? null : null}
        </div>
        {message.error ? (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
            {message.error}
          </div>
        ) : null}
        {isStreaming && !text ? (
          <span className="sr-only">Assistant is typing</span>
        ) : null}
        {isStreaming && text ? (
          <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-stone-400">
            <LoaderCircle className="size-3 animate-spin" />
            Generating...
          </span>
        ) : null}
      </div>
    </div>
  );
}
