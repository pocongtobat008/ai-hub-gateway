"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageSquarePlus, Pencil, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getImageConversationStats, type ImageConversation } from "@/store/image-conversations";

type ImageSidebarProps = {
  conversations: ImageConversation[];
  isLoadingHistory: boolean;
  selectedConversationId: string | null;
  onCreateDraft: () => void;
  onClearHistory: () => void | Promise<void>;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void | Promise<void>;
  onRenameConversation: (id: string, title: string) => void | Promise<void>;
  formatConversationTime: (value: string) => string;
  hideActionButtons?: boolean;
};

function ImageConversationItem({
  conversation,
  selected,
  onSelect,
  onDelete,
  onRename,
  formatTime,
  editingId,
  editingTitle,
  setEditingTitle,
  commitRename,
  cancelRename,
  startRename,
  editInputRef,
  hideActionButtons,
}: {
  conversation: ImageConversation;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void | Promise<void>;
  onRename: (id: string, title: string) => void | Promise<void>;
  formatTime: (v: string) => string;
  editingId: string | null;
  editingTitle: string;
  setEditingTitle: (v: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  startRename: (e: React.MouseEvent) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  hideActionButtons: boolean;
}) {
  const stats = getImageConversationStats(conversation);

  return (
    <div
      className={cn(
        "group relative rounded-xl transition-all duration-200 cursor-pointer min-h-[48px]",
        selected
          ? "bg-stone-900/8 dark:bg-stone-100/8"
          : "hover:bg-stone-100/60 dark:hover:bg-white/5",
      )}
    >
      <div className="relative flex items-start gap-2 px-2.5 py-2.5 transition-transform duration-200">
        <button type="button" onClick={() => onSelect(conversation.id)} className="flex-1 min-w-0 text-left">
          <div className="truncate text-[13px] font-medium text-stone-700 leading-tight dark:text-stone-300">
            {editingId === conversation.id ? (
              <input
                ref={editInputRef}
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") cancelRename();
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-stone-400 dark:border-stone-600 dark:bg-stone-800"
              />
            ) : (
              <span className="truncate block">{conversation.title}</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-stone-400 dark:text-stone-500">
            <span>{conversation.turns.length} rounds</span>
            <span className="opacity-30">·</span>
            <span>{formatTime(conversation.updatedAt)}</span>
          </div>
          {stats.running > 0 || stats.queued > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
              {stats.running > 0 ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  Processing {stats.running}
                </span>
              ) : null}
              {stats.queued > 0 ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  Queued {stats.queued}
                </span>
              ) : null}
            </div>
          ) : null}
        </button>

        {/* Desktop: hover actions */}
        {!hideActionButtons && (
          <div className="hidden sm:flex items-center gap-0.5 opacity-0 transition-all duration-200 group-hover:opacity-100 shrink-0 pt-0.5">
            <button
              type="button"
              onClick={startRename}
              className="inline-flex size-7 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-all duration-150 hover:scale-105 dark:hover:bg-white/10 dark:hover:text-stone-300"
            >
              <Pencil className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => void onDelete(conversation.id)}
              className="inline-flex size-7 items-center justify-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-500 transition-all duration-150 hover:scale-105 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ImageSidebar({
  conversations,
  isLoadingHistory,
  selectedConversationId,
  onCreateDraft,
  onClearHistory,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  formatConversationTime,
  hideActionButtons = false,
}: ImageSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [query, setQuery] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const startRename = useCallback((conversation: ImageConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  }, []);

  const commitRename = useCallback(() => {
    const trimmed = editingTitle.trim();
    if (editingId && trimmed) {
      void onRenameConversation(editingId, trimmed);
    }
    setEditingId(null);
    setEditingTitle("");
  }, [editingId, editingTitle, onRenameConversation]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditingTitle("");
  }, []);

  const filtered = query.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.turns.some((t) => t.prompt.toLowerCase().includes(query.toLowerCase()))
      )
    : conversations;

  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col gap-2 py-1 sm:gap-3 sm:py-2">
        {!hideActionButtons && (
          <div className="flex items-center gap-2">
            <Button className="h-10 flex-1 rounded-xl bg-stone-950 text-white hover:bg-stone-800" onClick={onCreateDraft}>
              <MessageSquarePlus className="size-4" />
              New conversation
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-xl border-stone-200 bg-white/85 px-3 text-stone-600 hover:bg-white"
              onClick={() => void onClearHistory()}
              disabled={conversations.length === 0}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}

        {/* Search — only show when there are conversations */}
        {!hideActionButtons && conversations.length > 3 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-stone-200/60 bg-white/50 px-2 py-1.5 transition-all focus-within:border-stone-300 focus-within:bg-white dark:border-white/8 dark:bg-white/5 dark:focus-within:border-white/20">
            <Search className="size-3.5 shrink-0 text-stone-400 dark:text-stone-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search images..."
              className="flex-1 bg-transparent text-[12px] text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-300 dark:placeholder:text-stone-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inline-flex size-4 items-center justify-center rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              >
                <span className="text-[10px]">✕</span>
              </button>
            )}
          </div>
        )}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto [scrollbar-color:rgba(120,113,108,.45)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/40 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600/40",
            hideActionButtons ? "space-y-1 pr-0" : "space-y-1 pr-1",
          )}
        >
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 px-2 py-3 text-[12px] text-stone-500">
              <LoaderCircle className="size-3.5 animate-spin" />
              Loading history
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-1 py-6 text-center">
              <div className="text-[11px] text-stone-400 dark:text-stone-500">
                {query ? "No results found" : "No image history yet"}
              </div>
              {!query && (
                <div className="mt-1 text-[10px] text-stone-300 dark:text-stone-600">
                  Start generating to see history
                </div>
              )}
            </div>
          ) : (
            filtered.map((conversation) => {
              const active = conversation.id === selectedConversationId;
              return (
                <ImageConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  selected={active}
                  onSelect={onSelectConversation}
                  onDelete={onDeleteConversation}
                  onRename={onRenameConversation}
                  formatTime={formatConversationTime}
                  editingId={editingId}
                  editingTitle={editingTitle}
                  setEditingTitle={setEditingTitle}
                  commitRename={commitRename}
                  cancelRename={cancelRename}
                  startRename={(e) => startRename(conversation, e)}
                  editInputRef={editInputRef}
                  hideActionButtons={hideActionButtons}
                />
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
