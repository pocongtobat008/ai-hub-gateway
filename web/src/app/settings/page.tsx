"use client";

import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";

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
  { value: "basic", title: "Basic", icon: "⚙️" },
  { value: "backup", title: "Backup", icon: "💾" },
  { value: "keys", title: "Keys", icon: "🔑" },
  { value: "api-docs", title: "API", icon: "📡" },
  { value: "canvas", title: "Canvas", icon: "📐" },
  { value: "gemini", title: "Gemini", icon: "✨" },
  { value: "deepseek", title: "DeepSeek", icon: "🧠" },
  { value: "proxy", title: "Proxy", icon: "🌐" },
  { value: "cpa", title: "CPA", icon: "📊" },
  { value: "sub2api", title: "Sub2API", icon: "🔗" },
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
                  className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-200 data-[state=active]:bg-stone-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-white dark:data-[state=active]:text-stone-900"
                >
                  <span className="text-xs">{tab.icon}</span>
                  {tab.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        <div className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <TabsContent value="basic"><ConfigCard /></TabsContent>
        </div>
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
