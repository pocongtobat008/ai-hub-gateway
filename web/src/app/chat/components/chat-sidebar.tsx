"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatConversation } from "@/store/chat-conversations";

type ChatSidebarProps = {
  conversations: ChatConversation[];
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

export function ChatSidebar({
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
}: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const startRename = useCallback((conversation: ChatConversation, event: React.MouseEvent) => {
    event.stopPropagation();
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

  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col gap-2 py-1 sm:gap-3 sm:py-2">
        {!hideActionButtons && (
          <div className="flex items-center gap-2">
            <Button className="h-10 flex-1 rounded-xl bg-stone-950 text-white hover:bg-stone-800" onClick={onCreateDraft}>
              <MessageSquarePlus className="size-4" />
              New chat
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-xl border-stone-200 bg-white/85 px-3 text-stone-600 hover:bg-white"
              onClick={() => void onClearHistory()}
              disabled={conversations.length === 0}
              aria-label="Clear all chats"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto [scrollbar-color:rgba(120,113,108,.45)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-400/45 [&::-webkit-scrollbar-track]:bg-transparent",
            hideActionButtons ? "space-y-1 pr-0" : "space-y-2 pr-1",
          )}
        >
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-stone-500">
              <LoaderCircle className="size-4 animate-spin" />
              Loading chat history
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-2 py-3 text-sm leading-6 text-stone-500">
              No chats yet. Start a new conversation.
            </div>
          ) : (
            conversations.map((conversation) => {
              const active = conversation.id === selectedConversationId;
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group relative w-full border-l-2 text-left transition",
                    hideActionButtons ? "px-4 py-3.5" : "px-3 py-2 sm:py-3",
                    active
                      ? "border-stone-900 bg-black/[0.035] text-stone-950"
                      : "border-transparent text-stone-700 hover:border-stone-300 hover:bg-white/40",
                  )}
                >
                  <button type="button" onClick={() => onSelectConversation(conversation.id)} className="block w-full pr-8 text-left">
                    <div className={cn("truncate font-semibold", hideActionButtons ? "text-base" : "text-sm")}>
                      {editingId === conversation.id ? (
                        <input
                          ref={editInputRef}
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitRename();
                            if (event.key === "Escape") cancelRename();
                          }}
                          onClick={(event) => event.stopPropagation()}
                          className="w-full truncate rounded border border-stone-300 bg-white px-1 py-0.5 text-sm outline-none focus:border-stone-500"
                        />
                      ) : (
                        <span className="truncate">{conversation.title}</span>
                      )}
                    </div>
                    <div className={cn("mt-1 text-xs", active ? "text-stone-500" : "text-stone-400")}>
                      {conversation.messages.length} messages · {formatConversationTime(conversation.updatedAt)}
                    </div>
                  </button>
                  <div className="absolute top-2.5 right-1.5 flex items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(event) => startRename(conversation, event)}
                      className="inline-flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                      aria-label="Rename chat"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteConversation(conversation.id)}
                      className="inline-flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-rose-500"
                      aria-label="Delete chat"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
