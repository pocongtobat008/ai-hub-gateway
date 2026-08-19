"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { PageTransition } from "@/components/page-transition";
import { getValidatedAuthSession } from "@/lib/auth-session";
import { type StoredAuthSession } from "@/store/auth";
import type { ChatConversation } from "@/store/chat-conversations";

// ── Context to share conversation data from chat page to sidebar ─────────────

export type SidebarCallbacks = {
  conversations: ChatConversation[];
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
    selectedConversationId: null,
    onSelectConversation: () => {},
    onCreateDraft: () => {},
    onDeleteConversation: () => {},
    onRenameConversation: () => {},
    formatConversationTime: () => "",
  });

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
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <AppSidebar
          session={session}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
          conversations={c.conversations}
          selectedConversationId={c.selectedConversationId}
          onSelectConversation={c.onSelectConversation}
          onCreateDraft={c.onCreateDraft}
          onDeleteConversation={c.onDeleteConversation}
          onRenameConversation={c.onRenameConversation}
          formatConversationTime={c.formatConversationTime}
        />

        <main
          className="flex-1 min-w-0 transition-all duration-300"
          style={{ marginLeft: sidebarWidth }}
        >
          <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6">
            <PageTransition>
              {children}
            </PageTransition>
          </div>
        </main>
      </div>
    </SidebarCallbacksContext.Provider>
  );
}
