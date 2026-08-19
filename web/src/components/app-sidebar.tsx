"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Atom,
  BookOpen,
  Box,
  Clapperboard,
  Cog,
  FileJson,
  Gem,
  Image,
  LogOut,
  MessageSquare,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
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
  type StoredAuthSession,
} from "@/store/auth";
import type { ChatConversation } from "@/store/chat-conversations";

type NavItem = { href: string; label: string; icon: React.ElementType };

const mainNav: NavItem[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/image", label: "Image Gen", icon: Image },
  { href: "/gemini", label: "Gemini", icon: Sparkles },
];

const accountNav: NavItem[] = [
  { href: "/accounts", label: "GPT Accounts", icon: Cog },
  { href: "/gemini-accounts", label: "Gemini Accounts", icon: Gem },
  { href: "/deepseek-accounts", label: "DeepSeek", icon: Atom },
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
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  index?: number;
}) {
  const active = pathname === item.href || (item.href !== "/chat" && pathname.startsWith(item.href));
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-200 hover-lift",
        collapsed && "justify-center px-0",
        active
          ? "bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900"
          : "text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/8 dark:hover:text-white",
      )}
      title={collapsed ? item.label : undefined}
      style={{ animationDelay: `${(index || 0) * 40}ms` }}
    >
      <Icon className={cn("size-4 shrink-0 transition-transform duration-200 group-hover:scale-110", active && "text-white dark:text-stone-900")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {active && !collapsed && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-0.5 size-1 rounded-full bg-current animate-scale-in" />
      )}
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className={cn(
          "flex size-8 items-center justify-center rounded-lg transition-all duration-200 btn-press",
          selected
            ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
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
        "group relative rounded-lg px-2 py-1.5 transition-all duration-200 cursor-pointer animate-fade-in",
        selected
          ? "bg-stone-900/8 dark:bg-stone-100/8"
          : "hover:bg-stone-100/60 dark:hover:bg-white/5",
      )}
      style={{ animationDelay: `${(index || 0) * 30}ms` }}
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
              className="w-full rounded border border-stone-300 bg-white px-1 py-0.5 text-[12px] outline-none focus:border-stone-400 dark:border-stone-600 dark:bg-stone-800"
            />
          ) : (
            <span className="truncate">{conversation.title}</span>
          )}
        </div>
        <div className="mt-0.5 text-[10px] text-stone-400 dark:text-stone-500">
          {conversation.messages.length} msg · {formatTime(conversation.updatedAt)}
        </div>
      </button>
      <div className="absolute top-1.5 right-1 flex items-center gap-0.5 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 translate-x-1">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="inline-flex size-5 items-center justify-center rounded text-stone-400 hover:text-stone-600 transition-all duration-150 hover:scale-110 dark:hover:text-stone-300"
        >
          <Pencil className="size-2.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(conversation.id); }}
          className="inline-flex size-5 items-center justify-center rounded text-stone-400 hover:text-rose-500 transition-all duration-150 hover:scale-110"
        >
          <Trash2 className="size-2.5" />
        </button>
      </div>
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
  selectedConversationId,
  onSelectConversation,
  onCreateDraft,
  onDeleteConversation,
  onRenameConversation,
  formatConversationTime,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
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
          {/* Desktop collapse button */}
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className="hidden lg:inline-flex size-6 shrink-0 items-center justify-center rounded-md text-stone-400 transition-all duration-200 hover:bg-stone-100 hover:text-stone-700 hover:scale-110 dark:hover:bg-white/8 dark:hover:text-stone-200"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeftOpen className={cn("size-3.5 transition-transform duration-300", !collapsed && "rotate-180")} />
          </button>
          {/* Mobile close button */}
          <button
            type="button"
            onClick={() => onMobileOpenChange(false)}
            className="lg:hidden inline-flex size-6 shrink-0 items-center justify-center rounded-md text-stone-400 transition-all duration-200 hover:bg-stone-100 hover:text-stone-700 hover:rotate-90"
            title="Close menu"
          >
            <PanelLeftClose className="size-3.5" />
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

      {/* Main navigation */}
      <nav className={cn("shrink-0 space-y-0.5 stagger-children", collapsed ? "px-2 pt-2" : "px-3 pt-2")}>
        {mainNav.map((item, i) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} index={i} />
        ))}
      </nav>

      {/* Account management links */}
      {!collapsed && (
        <nav className="shrink-0 space-y-0.5 px-3 pt-3 stagger-children">
          <div className="mb-1 px-2 text-[10px] font-bold tracking-[0.15em] text-stone-400 uppercase dark:text-stone-500 animate-fade-in">
            Accounts
          </div>
          {accountNav.map((item, i) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} index={i} />
          ))}
        </nav>
      )}

      {/* System links (collapsed only) */}
      {collapsed && (
        <nav className="shrink-0 space-y-0.5 px-2 pt-3 stagger-children">
          {[...accountNav, ...systemNav].map((item, i) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} index={i} />
          ))}
        </nav>
      )}

      {/* System links */}
      {!collapsed && (
        <nav className="shrink-0 space-y-0.5 px-3 pt-3 stagger-children">
          <div className="mb-1 px-2 text-[10px] font-bold tracking-[0.15em] text-stone-400 uppercase dark:text-stone-500 animate-fade-in">
            System
          </div>
          {systemNav.map((item, i) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} index={i} />
          ))}
        </nav>
      )}

      {/* Conversation History */}
      <div className="flex-1 min-h-0 overflow-hidden px-3 pt-2">
        {!collapsed && (
          <>
            <div className="mb-1.5 flex items-center justify-between px-1 animate-fade-in">
              <span className="text-[10px] font-bold tracking-[0.15em] text-stone-400 uppercase dark:text-stone-500">
                History
              </span>
              {conversations.length > 0 && (
                <span className="text-[10px] text-stone-300 dark:text-stone-600">
                  {conversations.length}
                </span>
              )}
            </div>
            <div className="space-y-0.5 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/50 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600/50" style={{ maxHeight: "calc(100vh - 400px)" }}>
              {conversations.length === 0 ? (
                <div className="px-1 py-3 text-[11px] text-stone-400 dark:text-stone-500 animate-fade-in">
                  No chats yet
                </div>
              ) : (
                conversations.slice(0, 50).map((conv, i) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    selected={conv.id === selectedConversationId}
                    collapsed={false}
                    onSelect={(id) => {
                      onSelectConversation?.(id);
                      onMobileOpenChange(false);
                    }}
                    onDelete={onDeleteConversation || (() => {})}
                    onRename={onRenameConversation || (() => {})}
                    formatTime={formatTime}
                    index={i}
                  />
                ))
              )}
            </div>
          </>
        )}
        {collapsed && (
          <div className="space-y-0.5 pt-1 stagger-children">
            {conversations.slice(0, 10).map((conv, i) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                selected={conv.id === selectedConversationId}
                collapsed={true}
                onSelect={(id) => {
                  onSelectConversation?.(id);
                  onMobileOpenChange(false);
                }}
                onDelete={onDeleteConversation || (() => {})}
                onRename={onRenameConversation || (() => {})}
                formatTime={formatTime}
                index={i}
              />
            ))}
          </div>
        )}
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
              className="inline-flex size-6 items-center justify-center rounded-md text-stone-400 transition-all duration-200 hover:bg-rose-50 hover:text-rose-600 hover:scale-110 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
              title="Logout"
            >
              <LogOut className="size-3" />
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
          "lg:hidden fixed inset-y-0 left-0 z-40 flex flex-col border-r border-stone-200/60 bg-stone-50/95 backdrop-blur-xl transition-all duration-300 ease-out dark:border-white/5 dark:bg-stone-950/95",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ width: 260 }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
