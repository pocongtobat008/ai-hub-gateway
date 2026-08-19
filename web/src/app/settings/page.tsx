"use client";

import { useEffect, useRef } from "react";
import {
  Atom,
  BookOpen,
  Box,
  Clapperboard,
  Cloud,
  Cog,
  Database,
  FileJson,
  Gem,
  Key,
  LoaderCircle,
  Shield,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthGuard } from "@/lib/use-auth-guard";

import { BackupSettingsCard } from "./components/backup-settings-card";
import { ApiDocsCard } from "./components/api-docs-card";
import { ConfigCard } from "./components/config-card";
import { CPAPoolDialog } from "./components/cpa-pool-dialog";
import { CPAPoolsCard } from "./components/cpa-pools-card";
import { DeepSeekCard } from "./components/deepseek-card";
import { GeminiCard } from "./components/gemini-card";
import { ImportBrowserDialog } from "./components/import-browser-dialog";
import { ProxyRuntimeCard } from "./components/proxy-runtime-card";
import { SettingsHeader } from "./components/settings-header";
import { Sub2APIConnections } from "./components/sub2api-connections";
import { ThirdPartyAppsCard } from "./components/third-party-apps-card";
import { UserKeysCard } from "./components/user-keys-card";
import { useSettingsStore } from "./store";

const settingsTabs = [
  { value: "basic", title: "Basic", icon: Cog },
  { value: "management", title: "Accounts", icon: Shield },
  { value: "provider", title: "Providers", icon: Gem },
  { value: "proxy", title: "Network", icon: Cloud },
  { value: "tools", title: "Tools", icon: Box },
  { value: "backup", title: "Backup", icon: Database },
];

function SettingsDataController() {
  const didLoadRef = useRef(false);
  const initialize = useSettingsStore((state) => state.initialize);
  const loadPools = useSettingsStore((state) => state.loadPools);
  const loadBackups = useSettingsStore((state) => state.loadBackups);
  const pools = useSettingsStore((state) => state.pools);
  const backupState = useSettingsStore((state) => state.backupState);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const hasRunningJobs = pools.some((pool) => {
      const status = pool.import_job?.status;
      return status === "pending" || status === "running";
    });
    if (!hasRunningJobs) return;
    const timer = window.setInterval(() => { void loadPools(true); }, 1500);
    return () => window.clearInterval(timer);
  }, [loadPools, pools]);

  useEffect(() => {
    if (!backupState?.running) return;
    const timer = window.setInterval(() => { void loadBackups(true); }, 3000);
    return () => window.clearInterval(timer);
  }, [backupState?.running, loadBackups]);

  return null;
}

function SettingsPageContent() {
  return (
    <>
      <SettingsDataController />
      <SettingsHeader />
      <Tabs defaultValue="basic" className="space-y-4">
        <div className="sticky top-0 lg:top-16 z-20 animate-fade-in">
          <div className="hide-scrollbar glass-strong overflow-x-auto rounded-2xl border border-white/40 px-2 py-2 dark:border-white/5">
            <TabsList variant="line" className="min-w-max justify-start gap-1 bg-transparent p-0">
              {settingsTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="settings-tab flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-medium transition-all duration-200 sm:px-3.5 sm:py-2 sm:text-[13px]"
                >
                  <tab.icon className="size-3.5" />
                  <span className="hidden sm:inline">{tab.title}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        <div className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <TabsContent value="basic"><ConfigCard /></TabsContent>
        </div>
        <TabsContent value="management">
          <div className="space-y-4">
            <div className="glass-card rounded-2xl border border-white/40 p-6 dark:border-white/5">
              <h3 className="mb-4 text-lg font-bold tracking-tight">Account Management</h3>
              <p className="mb-4 text-sm text-stone-500">Quick links to manage all your AI provider accounts in one place.</p>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
                {[
                  { href: "/accounts", label: "GPT Accounts", desc: "Manage OpenAI tokens", icon: Key },
                  { href: "/gemini-accounts", label: "Gemini Accounts", desc: "Google account cookies", icon: Gem },
                  { href: "/deepseek-accounts", label: "DeepSeek", desc: "DeepSeek email/password", icon: Atom },
                  { href: "/image-manager", label: "Image Manager", desc: "View generated images", icon: Clapperboard },
                  { href: "/logs", label: "Request Logs", desc: "Monitor API traffic", icon: FileJson },
                  { href: "/debug", label: "Debug Console", desc: "Test & debug tools", icon: BookOpen },
                ].map((card) => (
                  <a key={card.href} href={card.href} className="glass-card card-hover flex items-center gap-3 rounded-xl p-3 transition-all sm:p-4">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-stone-800 text-white shadow-sm sm:size-10 dark:bg-stone-200 dark:text-stone-900">
                      <card.icon className="size-4 sm:size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{card.label}</div>
                      <div className="text-[11px] text-stone-400 truncate">{card.desc}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="provider">
          <div className="space-y-6">
            <GeminiCard />
            <DeepSeekCard />
            <UserKeysCard />
          </div>
        </TabsContent>
        <TabsContent value="proxy">
          <div className="space-y-6">
            <ProxyRuntimeCard />
            <Sub2APIConnections />
            <CPAPoolsCard />
          </div>
        </TabsContent>
        <TabsContent value="tools">
          <div className="space-y-6">
            <ThirdPartyAppsCard />
            <ApiDocsCard />
          </div>
        </TabsContent>
        <TabsContent value="backup"><BackupSettingsCard /></TabsContent>
      </Tabs>
      <CPAPoolDialog />
      <ImportBrowserDialog />
    </>
  );
}

export default function SettingsPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);

  if (isCheckingAuth || !session || session.role !== "admin") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="size-6 animate-spin text-stone-300 dark:text-stone-600" />
          <span className="text-xs text-stone-400 dark:text-stone-500">Loading settings...</span>
        </div>
      </div>
    );
  }

  return <SettingsPageContent />;
}
