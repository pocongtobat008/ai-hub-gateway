"use client";

import { ArrowUp, ImagePlus, Square, X } from "lucide-react";
import { useRef, useState, type ClipboardEvent, type DragEvent, type RefObject } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ComposerImage = {
  id: string;
  name: string;
  dataUrl: string;
};

export type ComposerGem = {
  id: string;
  name: string;
};

export type ComposerAccount = {
  id: string;
  name: string;
};

export type ComposerTool = "auto" | "image" | "canvas" | "video" | "research";

export const TOOL_OPTIONS: Array<{ value: ComposerTool; label: string; icon: string }> = [
  { value: "auto", label: "Auto", icon: "🤖" },
  { value: "image", label: "Image", icon: "🎨" },
  { value: "canvas", label: "Canvas", icon: "📐" },
  { value: "video", label: "Video", icon: "🎬" },
  { value: "research", label: "Research", icon: "🔬" },
];

type ChatComposerProps = {
  input: string;
  model: string;
  models: string[];
  reasoningEffort: string;
  isGeminiModel: boolean;
  gem: string;
  gems: ComposerGem[];
  accountId: string;
  accounts: ComposerAccount[];
  tool: ComposerTool;
  images: ComposerImage[];
  isStreaming: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onReasoningEffortChange: (value: string) => void;
  onGemChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onToolChange: (value: ComposerTool) => void;
  onImagesChange: (files: File[]) => void | Promise<void>;
  onRemoveImage: (id: string) => void;
  onSubmit: () => void | Promise<void>;
  onStop: () => void;
};

const imageFileNamePattern = /\.(avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i;

function isImageFile(file: File) {
  return file.type.startsWith("image/") || (!file.type && imageFileNamePattern.test(file.name));
}

export function ChatComposer({
  input,
  model,
  models,
  reasoningEffort,
  isGeminiModel,
  gem,
  gems,
  accountId,
  accounts,
  tool,
  images,
  isStreaming,
  textareaRef,
  onInputChange,
  onModelChange,
  onReasoningEffortChange,
  onGemChange,
  onAccountChange,
  onToolChange,
  onImagesChange,
  onRemoveImage,
  onSubmit,
  onStop,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    event.preventDefault();
    void onImagesChange(imageFiles);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedImages(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedImages(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const imageFiles = Array.from(event.dataTransfer.files || []).filter(isImageFile);
    if (event.dataTransfer.files.length > 0 || imageFiles.length > 0) {
      event.preventDefault();
      event.stopPropagation();
    }
    setIsDragging(false);
    if (imageFiles.length === 0) return;
    void onImagesChange(imageFiles);
  };

  const selectedModelLabel = model || "auto";

  return (
    <div className="shrink-0 flex justify-center px-1 sm:px-0">
      <div style={{ width: "min(980px, 100%)" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(event) => {
            void onImagesChange(Array.from(event.target.files || []));
            event.currentTarget.value = "";
          }}
        />

        {images.length > 0 ? (
          <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
            {images.map((image) => (
              <div key={image.id} className="relative size-14 shrink-0 sm:size-16">
                <img
                  src={image.dataUrl}
                  alt={image.name}
                  className="size-14 rounded-2xl border border-stone-200 object-cover sm:size-16"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(image.id)}
                  className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-800"
                  aria-label={`Remove ${image.name}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div
          className={cn(
            "chat-input-wrapper overflow-hidden rounded-[24px] transition-all duration-300 sm:rounded-[32px]",
            isDragging && "border-stone-900 bg-stone-50 dark:border-white/20 dark:bg-white/5",
          )}
        >
          <div
            className="relative cursor-text"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => textareaRef.current?.focus()}
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onPaste={handlePaste}
              placeholder="Message chatgpt2api…"
              rows={1}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!isStreaming) void onSubmit();
                }
              }}
              className="max-h-40 min-h-[56px] resize-none rounded-[24px] border-0 bg-transparent px-4 pt-4 pb-2 text-[15px] leading-6 text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0 dark:text-stone-100 dark:placeholder:text-stone-500 sm:min-h-[64px] sm:px-6 sm:pt-5 sm:pb-3 sm:text-base"
            />
            {isDragging ? (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[24px] border-2 border-dashed border-stone-900 bg-white/85 text-sm font-medium text-stone-900 backdrop-blur-[1px] sm:rounded-[32px]">
                <div className="flex items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-white shadow-lg">
                  <ImagePlus className="size-4" />
                  <span>Release to attach image</span>
                </div>
              </div>
            ) : null}

            <div className="flex items-end justify-between gap-2 rounded-b-[24px] border-t border-stone-100/80 bg-white/80 px-3 pt-2 pb-3 backdrop-blur-sm dark:border-white/5 dark:bg-white/3 sm:rounded-b-none sm:px-6 sm:pb-4 sm:pt-3" onClick={(event) => event.stopPropagation()}>
              <div className="hide-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:pb-0">
                {/* Image attach button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-stone-200/60 bg-white/50 px-3 text-xs font-medium text-stone-600 backdrop-blur-sm transition-all duration-200 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 sm:h-9 sm:px-3.5 dark:border-white/8 dark:bg-white/5 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-white"
                  aria-label="Attach image"
                >
                  <ImagePlus className="size-3.5" />
                  <span className="hidden sm:inline">Image</span>
                </button>

                {/* Tool pills */}
                {TOOL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onToolChange(option.value)}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-all duration-200 sm:h-9 sm:px-3.5",
                      tool === option.value
                        ? "bg-stone-900 text-white shadow-sm dark:bg-white dark:text-stone-900"
                        : "border border-stone-200/60 bg-white/50 text-stone-500 hover:bg-stone-50 hover:text-stone-700 dark:border-white/8 dark:bg-white/5 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-white",
                    )}
                  >
                    <span className="text-xs">{option.icon}</span>
                    <span className="hidden sm:inline">{option.label}</span>
                  </button>
                ))}

                {/* Model selector */}
                <div className="relative shrink-0">
                  <Select value={model} onValueChange={onModelChange}>
                    <SelectTrigger
                      className="h-8 max-w-[140px] rounded-full border-stone-200/60 bg-white/50 text-xs font-medium text-stone-600 shadow-none backdrop-blur-sm sm:h-9 sm:max-w-[180px]"
                      aria-label="Model"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <img src="/openai.svg" alt="" aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{selectedModelLabel}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent className="z-[120]">
                      {models.map((option) => (
                        <SelectItem key={option} value={option} className="pr-10">
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Gemini selectors */}
                {isGeminiModel && gems.length > 0 && (
                  <div className="relative shrink-0">
                    <Select value={gem || "default"} onValueChange={(value) => onGemChange(value === "default" ? "" : value)}>
                      <SelectTrigger
                        className="h-8 max-w-[130px] rounded-full border-stone-200/60 bg-white/50 text-xs font-medium text-stone-600 shadow-none backdrop-blur-sm sm:h-9 sm:max-w-[160px]"
                        aria-label="Gem"
                      >
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
                )}

                {isGeminiModel && accounts.length > 1 && (
                  <div className="relative shrink-0">
                    <Select value={accountId || "default"} onValueChange={(value) => onAccountChange(value === "default" ? "" : value)}>
                      <SelectTrigger
                        className="h-8 max-w-[130px] rounded-full border-stone-200/60 bg-white/50 text-xs font-medium text-stone-600 shadow-none backdrop-blur-sm sm:h-9 sm:max-w-[160px]"
                        aria-label="Account"
                      >
                        <span className="truncate">
                          {accountId ? accounts.find((item) => item.id === accountId)?.name || "Account" : "Account: auto"}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        <SelectItem value="default">Auto</SelectItem>
                        {accounts.map((item) => (
                          <SelectItem key={item.id} value={item.id} className="pr-10">
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Reasoning selector */}
                <div className="relative shrink-0">
                  <Select value={reasoningEffort || "default"} onValueChange={(value) => onReasoningEffortChange(value === "default" ? "" : value)}>
                    <SelectTrigger
                      className="h-8 max-w-[110px] rounded-full border-stone-200/60 bg-white/50 text-xs font-medium text-stone-600 shadow-none backdrop-blur-sm sm:h-9 sm:max-w-[140px]"
                      aria-label="Reasoning effort"
                    >
                      <span className="truncate">
                        {reasoningEffort ? `${reasoningEffort}` : "Auto"}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-[120]">
                      <SelectItem value="default">Auto</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="xhigh">Extra high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 transition-all duration-200 hover:bg-stone-100 hover:scale-105 dark:border-white/15 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/20 sm:size-10"
                  aria-label="Stop generating"
                >
                  <Square className="size-3.5 fill-current sm:size-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  disabled={!input.trim() && images.length === 0}
                  className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-stone-900 text-white shadow-md transition-all duration-200 hover:bg-stone-800 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:hover:scale-100 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200 sm:size-10"
                  aria-label="Send message"
                >
                  <ArrowUp className="size-3.5 sm:size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-2 px-2 text-center text-[11px] text-stone-400 dark:text-stone-500 sm:text-xs">
          ChatGPT can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
}

function hasDraggedImages(dataTransfer: DataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  if (items.length > 0) {
    return items.some((item) => item.kind === "file" && (item.type.startsWith("image/") || !item.type));
  }
  return Array.from(dataTransfer.files || []).some(isImageFile);
}
