"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { LoaderCircle, PanelLeft } from "lucide-react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { PageTransition } from "@/components/page-transition";
import { getValidatedAuthSession } from "@/lib/auth-session";
import { type StoredAuthSession } from "@/store/auth";
import type { ChatConversation } from "@/store/chat-conversations";
import { listImageConversations, type ImageConversation } from "@/store/image-conversations";

// ── Context to share conversation data from chat page to sidebar ─────────────

export type UnifiedConversation = {
  id: string;
  title: string;
  type: "chat" | "image";
  updatedAt: string;
  messageCount: number;
  meta?: string;
};

export type SidebarCallbacks = {
  conversations: ChatConversation[];
  imageConversations: ImageConversation[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onCreateDraft: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  formatConversationTime: (value: string) => string;
};

const SidebarCallbacksContext = createContext<React.MutableRefObject<SidebarCallbacks>>({
  current: {
    conversations: [],
    imageConversations: [],
    selectedConversationId: null,
    onSelectConversation: () => {},
    onCreateDraft: () => {},
    onDeleteConversation: () => {},
    onRenameConversation: () => {},
    formatConversationTime: () => "",
  },
});

export const useSidebarCallbacks = () => useContext(SidebarCallbacksContext);

// ── Shell ────────────────────────────────────────────────────────────────────

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<StoredAuthSession | null | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [, forceUpdate] = useState(0);
  const callbacksRef = useRef<SidebarCallbacks>({
    conversations: [],
    imageConversations: [],
    selectedConversationId: null,
    onSelectConversation: () => {},
    onCreateDraft: () => {},
    onDeleteConversation: () => {},
    onRenameConversation: () => {},
    formatConversationTime: () => "",
  });
  const [imageConversations, setImageConversations] = useState<ImageConversation[]>([]);

  // Load image conversations
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const items = await listImageConversations();
        if (active) setImageConversations(items);
      } catch { /* ignore */ }
    };
    void load();
    const interval = setInterval(load, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [pathname]);

  // Expose refresh for image page
  useEffect(() => {
    (window as any).__refreshSidebarImageConversations = async () => {
      try {
        const items = await listImageConversations();
        setImageConversations(items);
      } catch { /* ignore */ }
    };
    return () => { delete (window as any).__refreshSidebarImageConversations; };
  }, []);

  // Detect desktop vs mobile
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Force re-render when chat page updates conversations
  const triggerUpdate = useCallback(() => forceUpdate((n) => n + 1), []);

  // Expose a way for chat page to register + trigger updates
  useEffect(() => {
    (window as any).__sidebarTriggerUpdate = triggerUpdate;
    return () => { delete (window as any).__sidebarTriggerUpdate; };
  }, [triggerUpdate]);

  // Expose mobile open/close for chat page hamburger button
  useEffect(() => {
    (window as any).__sidebarOpenMobile = () => setMobileOpen(true);
    (window as any).__sidebarCloseMobile = () => setMobileOpen(false);
    return () => {
      delete (window as any).__sidebarOpenMobile;
      delete (window as any).__sidebarCloseMobile;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (pathname === "/login") {
        if (!active) return;
        setSession(null);
        return;
      }
      const storedSession = await getValidatedAuthSession();
      if (!active) return;
      setSession(storedSession);
    };
    void load();
    return () => { active = false; };
  }, [pathname]);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Login page: no sidebar
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Loading
  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  // Not authenticated
  if (!session) {
    return <>{children}</>;
  }

  const c = callbacksRef.current;
  const sidebarWidth = isDesktop ? (collapsed ? 68 : 260) : 0;

  return (
    <SidebarCallbacksContext.Provider value={callbacksRef}>
      <div className="flex min-h-screen">
        {/* Mobile backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
            onClick={() => setMobileOpen(false)}
            onTouchMove={(e) => e.preventDefault()}
          />
        )}

        <AppSidebar
          session={session}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
          conversations={c.conversations}
          imageConversations={imageConversations}
          selectedConversationId={c.selectedConversationId}
          onSelectConversation={c.onSelectConversation}
          onCreateDraft={c.onCreateDraft}
          onDeleteConversation={c.onDeleteConversation}
          onRenameConversation={c.onRenameConversation}
          formatConversationTime={c.formatConversationTime}
        />

        {/* Global mobile hamburger button — visible on ALL pages */}
        {!mobileOpen && (
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="fixed top-3 left-3 z-50 lg:hidden inline-flex size-10 items-center justify-center rounded-xl bg-white/90 backdrop-blur-sm shadow-lg border border-stone-200/60 text-stone-600 transition-all duration-200 active:scale-95 dark:bg-stone-900/90 dark:border-white/10 dark:text-stone-300"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            title="Open menu"
          >
            <PanelLeft className="size-4" />
          </button>
        )}

        <main
          className="flex-1 min-w-0 transition-all duration-300"
          style={{ marginLeft: sidebarWidth }}
        >
          <div className="min-h-screen px-2 py-2 sm:px-4 sm:py-4 lg:px-6 lg:py-6">
            <PageTransition>
              {children}
            </PageTransition>
          </div>
        </main>
      </div>
    </SidebarCallbacksContext.Provider>
  );
}
