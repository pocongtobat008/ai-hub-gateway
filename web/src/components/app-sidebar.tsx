"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Atom,
  BookOpen,
  Bot,
  Box,
  Code,
  Clapperboard,
  Cog,
  FileJson,
  Film,
  Gem,
  Globe,
  Image,
  LogOut,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Paintbrush,
  Pencil,
  Scissors,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  clearStoredAuthSession,
  getStoredAuthKey,
  type StoredAuthSession,
} from "@/store/auth";
import type { ChatConversation } from "@/store/chat-conversations";
import type { ImageConversation } from "@/store/image-conversations";

type NavItem = { href: string; label: string; icon: React.ElementType; badgeKey?: string };

const mainNav: NavItem[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/image", label: "Image Gen", icon: Image },
  { href: "/storyboard", label: "Storyboard", icon: Film },
  { href: "/autoclip", label: "AutoClip", icon: Scissors },
  { href: "/mv-director", label: "MV Director", icon: Clapperboard },
  { href: "/voiceover", label: "Voice Over", icon: Mic },
  { href: "/gemini", label: "Gemini", icon: Sparkles },
];

const accountNav: NavItem[] = [
  { href: "/accounts", label: "GPT Accounts", icon: Cog, badgeKey: "gpt" },
  { href: "/gemini-accounts", label: "Gemini", icon: Gem, badgeKey: "gemini" },
  { href: "/deepseek-accounts", label: "DeepSeek", icon: Atom, badgeKey: "deepseek" },
  { href: "/grok-accounts", label: "Grok", icon: Zap, badgeKey: "grok" },
  { href: "/manus-accounts", label: "Manus", icon: Bot, badgeKey: "manus" },
  { href: "/custom-accounts", label: "Custom", icon: Globe, badgeKey: "custom" },
  { href: "/bansos-accounts", label: "Bansos", icon: Sparkles, badgeKey: "bansos" },
  { href: "/canvas-accounts", label: "Canvas (Free)", icon: Paintbrush, badgeKey: "canvas" },
  { href: "/opencode-accounts", label: "OpenCode", icon: Code, badgeKey: "opencode" },
  { href: "/image-manager", label: "Image Manager", icon: Box },
];

const systemNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Shield },
  { href: "/logs", label: "Logs", icon: FileJson },
  { href: "/debug", label: "Debug", icon: BookOpen },
];

type AppSidebarProps = {
  session: StoredAuthSession;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  conversations?: ChatConversation[];
  imageConversations?: ImageConversation[];
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
  index,
  badgeCount,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  index?: number;
  badgeCount?: number;
}) {
  const active = pathname === item.href;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition-all duration-200 hover-lift min-h-[40px]",
        collapsed && "justify-center px-0",
        active
          ? "bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900"
          : "text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/8 dark:hover:text-white",
      )}
      title={collapsed ? item.label : undefined}
      style={{ animationDelay: `${(index || 0) * 40}ms` }}
    >
      <Icon className={cn("size-4 shrink-0 transition-transform duration-200 group-hover:scale-110", active && "text-white dark:text-stone-900")} />
      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
      {!collapsed && badgeCount !== undefined && badgeCount > 0 && (
        <span className={cn(
          "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold min-w-[18px]",
          active
            ? "bg-white/20 text-white dark:bg-stone-900/20 dark:text-stone-900"
            : "bg-stone-200 text-stone-600 dark:bg-white/10 dark:text-stone-400",
        )}>
          {badgeCount}
        </span>
      )}
      {collapsed && badgeCount !== undefined && badgeCount > 0 && (
        <div className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-500 border-2 border-stone-50 dark:border-stone-950" />
      )}
      {active && !collapsed && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-0.5 size-1 rounded-full bg-current animate-scale-in" />
      )}
    </Link>
  );
}

function HistorySearch({
  conversations,
  onSelect,
  formatTime,
}: {
  conversations: ChatConversation[];
  onSelect: (id: string) => void;
  formatTime: (v: string) => string;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.messages.some((m) => {
          const content = typeof m.content === "string" ? m.content : "";
          return content.toLowerCase().includes(query.toLowerCase());
        })
      )
    : [];

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 rounded-lg border border-stone-200/60 bg-white/50 px-2 py-1.5 transition-all focus-within:border-stone-300 focus-within:bg-white dark:border-white/8 dark:bg-white/5 dark:focus-within:border-white/20">
        <Search className="size-3.5 shrink-0 text-stone-400 dark:text-stone-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(e.target.value.length > 0);
          }}
          onFocus={() => { if (query.length > 0) setIsOpen(true); }}
          onBlur={() => { setTimeout(() => setIsOpen(false), 200); }}
          placeholder="Search chats..."
          className="flex-1 bg-transparent text-[12px] text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-300 dark:placeholder:text-stone-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); setIsOpen(false); inputRef.current?.focus(); }}
            className="inline-flex size-4 items-center justify-center rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          >
            <span className="text-[10px]">✕</span>
          </button>
        )}
      </div>
      {isOpen && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[40vh] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-stone-900 dark:shadow-2xl sm:max-h-[30vh]">
          {filtered.slice(0, 20).map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => {
                onSelect(conv.id);
                setQuery("");
                setIsOpen(false);
              }}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-stone-100 dark:hover:bg-white/10 min-h-[40px]"
            >
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-stone-400 dark:text-stone-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-stone-700 dark:text-stone-300">
                  {conv.title}
                </div>
                <div className="mt-0.5 text-[10px] text-stone-400 dark:text-stone-500">
                  {conv.messages.length} msg · {formatTime(conv.updatedAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {isOpen && query.length > 0 && filtered.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-stone-200 bg-white p-3 text-center shadow-xl dark:border-white/10 dark:bg-stone-900">
          <div className="text-[11px] text-stone-400 dark:text-stone-500">No results found</div>
        </div>
      )}
    </div>
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
  index,
}: {
  conversation: ChatConversation;
  selected: boolean;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  formatTime: (v: string) => string;
  index?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);
  const [swipeX, setSwipeX] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const touchStartRef = useRef({ x: 0, y: 0, swiping: false });

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Swipe-to-delete gesture
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, swiping: false };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    // Only swipe left, and only if horizontal movement > vertical
    if (dx < 0 && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      touchStartRef.current.swiping = true;
      setSwipeX(Math.max(dx, -80));
    }
  };

  const handleTouchEnd = () => {
    if (touchStartRef.current.swiping) {
      if (swipeX < -50) {
        setShowActions(true);
      }
      setSwipeX(0);
    }
    touchStartRef.current.swiping = false;
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className={cn(
          "flex size-10 items-center justify-center rounded-lg transition-all duration-200 btn-press min-h-[40px] min-w-[40px]",
          selected
            ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
            : "text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/8 dark:hover:text-white",
        )}
        title={conversation.title}
      >
        <MessageSquare className="size-4" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "group relative rounded-xl transition-all duration-200 cursor-pointer animate-fade-in overflow-hidden min-h-[48px]",
        selected
          ? "bg-stone-900/8 dark:bg-stone-100/8"
          : "hover:bg-stone-100/60 dark:hover:bg-white/5",
      )}
      style={{ animationDelay: `${(index || 0) * 30}ms` }}
    >
      <div
        className="relative flex items-start gap-2 px-2.5 py-2.5 transition-transform duration-200"
        style={{ transform: `translateX(${swipeX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button type="button" onClick={() => onSelect(conversation.id)} className="flex-1 min-w-0 text-left">
          <div className="truncate text-[13px] font-medium text-stone-700 leading-tight dark:text-stone-300">
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
                className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-stone-400 dark:border-stone-600 dark:bg-stone-800"
              />
            ) : (
              <span className="truncate block">{conversation.title}</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-stone-400 dark:text-stone-500">
            <span>{conversation.messages.length} msg</span>
            <span className="opacity-30">·</span>
            <span>{formatTime(conversation.updatedAt)}</span>
          </div>
        </button>

        {/* Desktop: hover actions */}
        <div className="hidden sm:flex items-center gap-0.5 opacity-0 transition-all duration-200 group-hover:opacity-100 shrink-0 pt-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="inline-flex size-7 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-all duration-150 hover:scale-105 dark:hover:bg-white/10 dark:hover:text-stone-300"
          >
            <Pencil className="size-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(conversation.id); }}
            className="inline-flex size-7 items-center justify-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-500 transition-all duration-150 hover:scale-105 dark:hover:bg-rose-500/10"
          >
            <Trash2 className="size-3" />
          </button>
        </div>

        {/* Mobile: always-visible action button (tap to toggle) */}
        <div className="sm:hidden shrink-0 pt-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowActions(!showActions);
            }}
            className="inline-flex size-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 active:bg-stone-200 transition-all duration-150 min-h-[32px] min-w-[32px] dark:hover:bg-white/10"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Mobile: action bar (revealed on swipe or tap) */}
      {showActions && (
        <div className="sm:hidden flex items-center gap-1 px-2.5 pb-2 animate-slide-down">
          <button
            type="button"
            onClick={() => { setEditing(true); setShowActions(false); }}
            className="flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-[12px] font-medium text-stone-600 transition-all active:scale-95 dark:bg-white/10 dark:text-stone-300 min-h-[32px]"
          >
            <Pencil className="size-3" />
            Rename
          </button>
          <button
            type="button"
            onClick={() => { onDelete(conversation.id); setShowActions(false); }}
            className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-medium text-rose-600 transition-all active:scale-95 dark:bg-rose-500/10 dark:text-rose-400 min-h-[32px]"
          >
            <Trash2 className="size-3" />
            Delete
          </button>
          <button
            type="button"
            onClick={() => setShowActions(false)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-stone-400 transition-all active:scale-95 min-h-[32px]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function AppSidebar({
  session,
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
  conversations = [],
  imageConversations = [],
  selectedConversationId,
  onSelectConversation,
  onCreateDraft,
  onDeleteConversation,
  onRenameConversation,
  formatConversationTime,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

  // Fetch account counts for badges
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const authKey = await getStoredAuthKey();
        const headers: Record<string, string> = authKey ? { Authorization: `Bearer ${authKey}` } : {};
        const baseUrl = typeof window !== "undefined" ? (window as any).__NEXT_DATA__?.props?.pageProps?.apiUrl || "" : "";
        const urls: Record<string, string> = {
          gpt: "/api/accounts",
          gemini: "/api/gemini/accounts",
          deepseek: "/api/deepseek/accounts",
          grok: "/api/grok/accounts",
          manus: "/api/manus/accounts",
          custom: "/api/custom/accounts",
          bansos: "/api/bansos/accounts",
          canvas: "/api/canvas/accounts",
          opencode: "/api/opencode/accounts",
        };
        const counts: Record<string, number> = {};
        const promises = Object.entries(urls).map(async ([key, url]) => {
          try {
            const res = await fetch(url, { headers });
            if (res.ok) {
              const data = await res.json();
              counts[key] = Array.isArray(data.items) ? data.items.length : Array.isArray(data.accounts) ? data.accounts.length : 0;
            }
          } catch {
            // ignore
          }
        });
        await Promise.all(promises);
        setBadgeCounts(counts);
      } catch {
        // ignore
      }
    };
    void fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);
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

  const sidebarWidth = collapsed ? 68 : 260;

  const sidebarContent = (
    <>
      {/* Brand + Collapse toggle */}
      <div className="shrink-0 border-b border-stone-200/60 dark:border-white/5">
        <div className="flex h-12 items-center gap-2 px-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-stone-800 to-stone-950 text-white shadow-md dark:from-stone-200 dark:to-stone-400 dark:text-stone-950 transition-transform duration-300 hover:scale-110 hover:rotate-3">
            <Zap className="size-3.5" />
          </div>
          {!collapsed && (
            <div className="flex flex-1 items-center animate-fade-in">
              <span className="text-[14px] font-bold tracking-tight brand-text">BecomeAI</span>
            </div>
          )}
          {/* Collapse/Expand toggle — desktop */}
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className="hidden lg:inline-flex size-6 shrink-0 items-center justify-center rounded-md text-stone-400 transition-all duration-200 hover:bg-stone-100 hover:text-stone-700 hover:scale-110 dark:hover:bg-white/8 dark:hover:text-stone-200"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
          </button>
          {/* Close button — mobile only */}
          <button
            type="button"
            onClick={() => onMobileOpenChange(false)}
            className="lg:hidden inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-all duration-200 hover:bg-stone-100 hover:text-stone-700 active:bg-stone-200 active:scale-95"
            aria-label="Close menu"
            title="Close menu"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>
      </div>

      {/* New Chat button */}
      {!collapsed && (
        <div className="shrink-0 px-3 pt-2 pb-1 animate-fade-in">
          <button
            type="button"
            onClick={() => {
              onCreateDraft?.();
              onMobileOpenChange(false);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2 text-[12px] font-semibold text-white shadow-md transition-all duration-200 hover:bg-stone-800 hover:shadow-lg active:scale-[0.97] dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            <MessageSquarePlus className="size-3.5 transition-transform duration-200 group-hover:rotate-12" />
            New Chat
          </button>
        </div>
      )}

      {/* SCROLLABLE MIDDLE: nav + accounts + history — all scroll together */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/40 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600/40">
        {/* Main navigation */}
        <nav className={cn("space-y-0.5", collapsed ? "px-2 pt-2" : "px-3 pt-2")}>
          {mainNav.map((item, i) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} index={i} />
          ))}
        </nav>

        {/* Account management links */}
        {!collapsed && (
          <nav className="space-y-0.5 px-3 pt-3">
            <div className="mb-1 px-2 text-[10px] font-bold tracking-[0.15em] text-stone-400 uppercase dark:text-stone-500">
              Accounts
            </div>
            {accountNav.map((item, i) => (
              <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} index={i} badgeCount={item.badgeKey ? badgeCounts[item.badgeKey] : undefined} />
            ))}
          </nav>
        )}

        {/* System links (collapsed only) */}
        {collapsed && (
          <nav className="space-y-0.5 px-2 pt-3">
            {[...accountNav, ...systemNav].map((item, i) => (
              <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} index={i} badgeCount={item.badgeKey ? badgeCounts[item.badgeKey] : undefined} />
            ))}
          </nav>
        )}

        {/* System links */}
        {!collapsed && (
          <nav className="space-y-0.5 px-3 pt-3">
            <div className="mb-1 px-2 text-[10px] font-bold tracking-[0.15em] text-stone-400 uppercase dark:text-stone-500">
              System
            </div>
            {systemNav.map((item, i) => (
              <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} index={i} />
            ))}
          </nav>
        )}

        {/* Conversation History — hidden when collapsed */}
        {(() => {
          // Merge chat + image conversations into unified timeline
          type UnifiedItem = {
            id: string;
            title: string;
            type: "chat" | "image";
            updatedAt: string;
            messageCount: number;
            meta?: string;
          };
          const chatItems: UnifiedItem[] = conversations.map((c) => ({
            id: c.id,
            title: c.title,
            type: "chat" as const,
            updatedAt: c.updatedAt,
            messageCount: c.messages.length,
            meta: `${c.messages.length} msg`,
          }));
          const imageItems: UnifiedItem[] = imageConversations.map((c) => ({
            id: `img:${c.id}`,
            title: c.title || "Image generation",
            type: "image" as const,
            updatedAt: c.updatedAt,
            messageCount: c.turns.length,
            meta: `${c.turns.length} rounds`,
          }));
          const allItems = [...chatItems, ...imageItems]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 50);
          const totalCount = allItems.length;

          return (
            <div className={cn("px-3 pt-3 pb-2 flex flex-col", collapsed && "hidden")}>
              {!collapsed && (
                <>
                  <div className="mb-1.5 flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold tracking-[0.15em] text-stone-400 uppercase dark:text-stone-500">
                      History
                    </span>
                    {totalCount > 0 && (
                      <span className="text-[10px] text-stone-300 dark:text-stone-600">
                        {totalCount}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {totalCount === 0 ? (
                      <div className="px-1 py-6 text-center">
                        <div className="text-[11px] text-stone-400 dark:text-stone-500">
                          No history yet
                        </div>
                        <div className="mt-1 text-[10px] text-stone-300 dark:text-stone-600">
                          Start a conversation or generate an image
                        </div>
                      </div>
                    ) : (
                      allItems.map((item, i) => {
                        const isActive = item.id === selectedConversationId || item.id === `img:${selectedConversationId}`;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (item.type === "image") {
                                router.push(`/image?id=${item.id.replace("img:", "")}`);
                              } else {
                                onSelectConversation?.(item.id);
                              }
                              onMobileOpenChange(false);
                            }}
                            className={cn(
                              "group relative flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-all duration-200 min-h-[40px]",
                              isActive
                                ? "bg-stone-900/8 dark:bg-stone-100/8"
                                : "hover:bg-stone-100/60 dark:hover:bg-white/5",
                            )}
                            style={{ animationDelay: `${i * 30}ms` }}
                          >
                            <div className={cn(
                              "size-5 shrink-0 flex items-center justify-center rounded-md transition-colors",
                              item.type === "image"
                                ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                                : "bg-stone-100 text-stone-500 dark:bg-white/8 dark:text-stone-400",
                            )}>
                              {item.type === "image" ? <Image className="size-3" /> : <MessageSquare className="size-3" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-medium text-stone-700 leading-tight dark:text-stone-300">
                                {item.title}
                              </div>
                              <div className="mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
                                {item.meta} · {formatTime(item.updatedAt)}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* Footer: User + actions */}
      <div className="shrink-0 border-t border-stone-200/60 dark:border-white/5 animate-fade-in">
        <div className={cn("flex items-center gap-2 px-3 py-2", collapsed && "flex-col gap-1.5")}>
          <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-stone-700 to-stone-900 text-[9px] font-bold text-white shadow-sm transition-transform duration-200 hover:scale-110 dark:from-stone-300 dark:to-stone-500 dark:text-stone-950">
              {displayName.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 animate-fade-in">
                <div className="truncate text-[11px] font-semibold text-stone-900 dark:text-stone-100">
                  {displayName}
                </div>
                <div className="truncate text-[9px] text-stone-400 dark:text-stone-500">
                  {roleLabel}
                </div>
              </div>
            )}
          </div>

          <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex size-9 items-center justify-center rounded-lg text-stone-400 transition-all duration-200 hover:bg-rose-50 hover:text-rose-600 active:bg-rose-100 active:scale-95 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-stone-200/60 bg-stone-50/80 backdrop-blur-xl transition-all duration-300 ease-in-out dark:border-white/5 dark:bg-stone-950/80"
        style={{ width: sidebarWidth }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      <aside
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 z-40 flex flex-col border-r border-stone-200/60 bg-stone-50 dark:bg-stone-950 transition-all duration-300 ease-out dark:border-white/5 shadow-2xl",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ width: 280, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
