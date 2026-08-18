"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Atom,
  Clapperboard,
  Cog,
  Gem,
  Image,
  LogOut,
  MessageSquare,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  clearStoredAuthSession,
  type StoredAuthSession,
} from "@/store/auth";
import type { ChatConversation } from "@/store/chat-conversations";

type NavItem = { href: string; label: string; icon: React.ElementType };

const mainNav: NavItem[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/image", label: "Image Gen", icon: Image },
  { href: "/gemini", label: "Gemini", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Cog },
];

type AppSidebarProps = {
  session: StoredAuthSession;
  conversations?: ChatConversation[];
  selectedConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onCreateDraft?: () => void;
  onDeleteConversation?: (id: string) => void;
  onRenameConversation?: (id: string, title: string) => void;
  formatConversationTime?: (value: string) => string;
};

function SidebarLink({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const active = pathname === item.href;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-150",
        collapsed && "justify-center px-0",
        active
          ? "bg-stone-800 text-white shadow-md dark:bg-stone-200 dark:text-stone-900"
          : "text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/8 dark:hover:text-white",
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-white dark:text-stone-900")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function ConversationItem({
  conversation,
  selected,
  collapsed,
  onSelect,
  onDelete,
  onRename,
  formatTime,
}: {
  conversation: ChatConversation;
  selected: boolean;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  formatTime: (v: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (collapsed) {
    return (        <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className={cn(
          "flex size-8 items-center justify-center rounded-lg transition-all duration-150",
          selected
            ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
            : "text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/8 dark:hover:text-white",
        )}
        title={conversation.title}
      >
        <MessageSquare className="size-3.5" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "group relative rounded-lg px-2 py-1.5 transition-all duration-150 cursor-pointer",
        selected
          ? "bg-stone-800/8 dark:bg-stone-200/8"
          : "hover:bg-stone-100/60 dark:hover:bg-white/5",
      )}
    >
      <button type="button" onClick={() => onSelect(conversation.id)} className="block w-full pr-8 text-left">
        <div className="truncate text-[12px] font-medium text-stone-700 dark:text-stone-300">
          {editing ? (
            <input
              ref={inputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => {
                if (editTitle.trim()) onRename(conversation.id, editTitle.trim());
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (editTitle.trim()) onRename(conversation.id, editTitle.trim());
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded border border-stone-300 bg-white px-1 py-0.5 text-[12px] outline-none focus:border-violet-400 dark:border-stone-600 dark:bg-stone-800"
            />
          ) : (
            <span className="truncate">{conversation.title}</span>
          )}
        </div>
        <div className="mt-0.5 text-[10px] text-stone-400 dark:text-stone-500">
          {conversation.messages.length} msg · {formatTime(conversation.updatedAt)}
        </div>
      </button>
      <div className="absolute top-1.5 right-1 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="inline-flex size-5 items-center justify-center rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
        >
          <Pencil className="size-2.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(conversation.id); }}
          className="inline-flex size-5 items-center justify-center rounded text-stone-400 hover:text-rose-500"
        >
          <Trash2 className="size-2.5" />
        </button>
      </div>
    </div>
  );
}

export function AppSidebar({
  session,
  conversations = [],
  selectedConversationId,
  onSelectConversation,
  onCreateDraft,
  onDeleteConversation,
  onRenameConversation,
  formatConversationTime,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const roleLabel = session.role === "admin" ? "Admin" : "User";
  const displayName = session.name.trim() || roleLabel;
  const formatTime = formatConversationTime || ((v: string) => {
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  });

  const handleLogout = async () => {
    await clearStoredAuthSession();
    router.replace("/login");
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-stone-200/60 bg-stone-50/80 backdrop-blur-xl transition-all duration-300 dark:border-white/5 dark:bg-stone-950/80",
        collapsed ? "w-[68px]" : "w-[260px]",
      )}
    >
      {/* Brand + Collapse toggle */}
      <div className={cn("flex h-12 shrink-0 items-center border-b border-stone-200/60 dark:border-white/5", collapsed ? "justify-center px-2" : "gap-2 px-3")}>
        {!collapsed && (
          <div className="flex flex-1 items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-stone-800 to-stone-950 text-white shadow-md dark:from-stone-200 dark:to-stone-400 dark:text-stone-950">
              <Zap className="size-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold tracking-tight brand-text">BecomeAI</span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-stone-800 to-stone-950 text-white shadow-md dark:from-stone-200 dark:to-stone-400 dark:text-stone-950">
            <Zap className="size-3.5" />
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/8 dark:hover:text-stone-200"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </button>
      </div>

      {/* New Chat button */}
      {!collapsed && (
        <div className="shrink-0 px-3 pt-2 pb-1">
          <button
            type="button"
            onClick={() => onCreateDraft?.()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2 text-[12px] font-semibold text-white shadow-md transition-all hover:bg-stone-800 hover:shadow-lg active:scale-[0.98] dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
          >
            <MessageSquarePlus className="size-3.5" />
            New Chat
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className={cn("shrink-0 space-y-0.5", collapsed ? "px-2 pt-2" : "px-3 pt-2")}>
        {mainNav.map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </nav>

      {/* Management links */}
      {!collapsed && (
        <nav className="shrink-0 space-y-0.5 px-3 pt-3">
          <div className="mb-1 px-2 text-[10px] font-bold tracking-[0.15em] text-stone-400 uppercase dark:text-stone-500">
            Accounts
          </div>
          {[
            { href: "/accounts", label: "GPT Accounts", icon: Cog },
            { href: "/gemini-accounts", label: "Gemini Accounts", icon: Gem },
            { href: "/deepseek-accounts", label: "DeepSeek", icon: Atom },
            { href: "/image-manager", label: "Image Manager", icon: Clapperboard },
          ].map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
        </nav>
      )}

      {/* Conversation History */}
      <div className="flex-1 min-h-0 overflow-hidden px-3 pt-2">
        {!collapsed && (
          <>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[10px] font-bold tracking-[0.15em] text-stone-400 uppercase dark:text-stone-500">
                History
              </span>
              {conversations.length > 0 && (
                <span className="text-[10px] text-stone-300 dark:text-stone-600">
                  {conversations.length}
                </span>
              )}
            </div>
            <div className="space-y-0.5 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/50 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600/50" style={{ maxHeight: "calc(100vh - 340px)" }}>
              {conversations.length === 0 ? (
                <div className="px-1 py-3 text-[11px] text-stone-400 dark:text-stone-500">
                  No chats yet
                </div>
              ) : (
                conversations.slice(0, 50).map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    selected={conv.id === selectedConversationId}
                    collapsed={false}
                    onSelect={onSelectConversation || (() => {})}
                    onDelete={onDeleteConversation || (() => {})}
                    onRename={onRenameConversation || (() => {})}
                    formatTime={formatTime}
                  />
                ))
              )}
            </div>
          </>
        )}
        {collapsed && (
          <div className="space-y-0.5 pt-1">
            {conversations.slice(0, 10).map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                selected={conv.id === selectedConversationId}
                collapsed={true}
                onSelect={onSelectConversation || (() => {})}
                onDelete={onDeleteConversation || (() => {})}
                onRename={onRenameConversation || (() => {})}
                formatTime={formatTime}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: User + actions */}
      <div className="shrink-0 border-t border-stone-200/60 dark:border-white/5">
        <div className={cn("flex items-center gap-2 px-3 py-2", collapsed && "flex-col gap-1.5")}>
          <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-stone-700 to-stone-900 text-[9px] font-bold text-white shadow-sm dark:from-stone-300 dark:to-stone-500 dark:text-stone-950">
              {displayName.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-stone-900 dark:text-stone-100">
                  {displayName}
                </div>
                <div className="truncate text-[9px] text-stone-400 dark:text-stone-500">
                  {roleLabel}
                </div>
              </div>
            )}
          </div>

          <div className={cn("flex items-center gap-0.5", collapsed && "flex-col")}>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex size-6 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
              title="Logout"
            >
              <LogOut className="size-3" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
