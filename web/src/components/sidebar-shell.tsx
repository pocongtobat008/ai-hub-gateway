"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
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

  // Force re-render when chat page updates conversations
  const triggerUpdate = useCallback(() => forceUpdate((n) => n + 1), []);

  // Expose a way for chat page to register + trigger updates
  useEffect(() => {
    (window as any).__sidebarTriggerUpdate = triggerUpdate;
    return () => { delete (window as any).__sidebarTriggerUpdate; };
  }, [triggerUpdate]);

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

  return (
    <SidebarCallbacksContext.Provider value={callbacksRef}>
      <div className="flex min-h-screen">
        <AppSidebar
          session={session}
          conversations={c.conversations}
          selectedConversationId={c.selectedConversationId}
          onSelectConversation={c.onSelectConversation}
          onCreateDraft={c.onCreateDraft}
          onDeleteConversation={c.onDeleteConversation}
          onRenameConversation={c.onRenameConversation}
          formatConversationTime={c.formatConversationTime}
        />
        <main className="flex-1 pl-[260px] transition-all duration-300 max-lg:pl-0">
          <div className="min-h-screen px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="animate-fade-in">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarCallbacksContext.Provider>
  );
}
