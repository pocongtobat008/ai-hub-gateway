"use client";

import { useEffect, useRef } from "react";
import {
  Atom,
  BarChart3,
  BookOpen,
  Box,
  Clapperboard,
  Cloud,
  Cog,
  Database,
  FileJson,
  Gem,
  Globe,
  Key,
  Link,
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
  { value: "management", title: "Management", icon: Shield },
  { value: "backup", title: "Backup", icon: Database },
  { value: "keys", title: "Keys", icon: Key },
  { value: "api-docs", title: "API", icon: Globe },
  { value: "canvas", title: "Canvas", icon: Box },
  { value: "gemini", title: "Gemini", icon: Gem },
  { value: "deepseek", title: "DeepSeek", icon: Atom },
  { value: "proxy", title: "Proxy", icon: Cloud },
  { value: "cpa", title: "CPA", icon: BarChart3 },
  { value: "sub2api", title: "Sub2API", icon: Link },
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
        <div className="sticky top-16 z-20 animate-fade-in">
          <div className="glass-strong overflow-x-auto rounded-2xl border border-white/40 px-2 py-2 dark:border-white/5">
            <TabsList variant="line" className="min-w-max justify-start gap-1 bg-transparent p-0">
              {settingsTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-200 data-[state=active]:bg-stone-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-stone-200 dark:data-[state=active]:text-stone-900"
                >
                  <span className="text-xs"><tab.icon className="size-3.5" /></span>
                  {tab.title}
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <a href="/accounts" className="glass-card card-hover flex items-center gap-3 rounded-xl p-4 transition-all">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-stone-800 text-white shadow-sm dark:bg-stone-200 dark:text-stone-900">
                    <Key className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">GPT Accounts</div>
                    <div className="text-[11px] text-stone-400">Manage OpenAI tokens</div>
                  </div>
                </a>
                <a href="/gemini-accounts" className="glass-card card-hover flex items-center gap-3 rounded-xl p-4 transition-all">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-stone-800 text-white shadow-sm dark:bg-stone-200 dark:text-stone-900">
                    <Gem className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Gemini Accounts</div>
                    <div className="text-[11px] text-stone-400">Google account cookies</div>
                  </div>
                </a>
                <a href="/deepseek-accounts" className="glass-card card-hover flex items-center gap-3 rounded-xl p-4 transition-all">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-stone-800 text-white shadow-sm dark:bg-stone-200 dark:text-stone-900">
                    <Atom className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">DeepSeek Accounts</div>
                    <div className="text-[11px] text-stone-400">DeepSeek email/password</div>
                  </div>
                </a>
                <a href="/image-manager" className="glass-card card-hover flex items-center gap-3 rounded-xl p-4 transition-all">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-stone-800 text-white shadow-sm dark:bg-stone-200 dark:text-stone-900">
                    <Clapperboard className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Image Manager</div>
                    <div className="text-[11px] text-stone-400">View generated images</div>
                  </div>
                </a>
                <a href="/logs" className="glass-card card-hover flex items-center gap-3 rounded-xl p-4 transition-all">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-stone-800 text-white shadow-sm dark:bg-stone-200 dark:text-stone-900">
                    <FileJson className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Request Logs</div>
                    <div className="text-[11px] text-stone-400">Monitor API traffic</div>
                  </div>
                </a>
                <a href="/debug" className="glass-card card-hover flex items-center gap-3 rounded-xl p-4 transition-all">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-stone-800 text-white shadow-sm dark:bg-stone-200 dark:text-stone-900">
                    <BookOpen className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Debug Console</div>
                    <div className="text-[11px] text-stone-400">Test & debug tools</div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="proxy"><ProxyRuntimeCard /></TabsContent>
        <TabsContent value="backup"><BackupSettingsCard /></TabsContent>
        <TabsContent value="keys"><UserKeysCard /></TabsContent>
        <TabsContent value="canvas"><ThirdPartyAppsCard /></TabsContent>
        <TabsContent value="gemini"><GeminiCard /></TabsContent>
        <TabsContent value="deepseek"><DeepSeekCard /></TabsContent>
        <TabsContent value="api-docs"><ApiDocsCard /></TabsContent>
        <TabsContent value="cpa"><CPAPoolsCard /></TabsContent>
        <TabsContent value="sub2api"><Sub2APIConnections /></TabsContent>
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
