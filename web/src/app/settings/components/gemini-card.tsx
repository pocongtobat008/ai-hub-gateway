"use client";

import { Bot, ExternalLink, LoaderCircle, PlugZap, Save, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import { useSettingsStore } from "../store";

export function GeminiCard() {
  const config = useSettingsStore((state) => state.config);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const geminiStatus = useSettingsStore((state) => state.geminiStatus);
  const isLoadingGeminiStatus = useSettingsStore((state) => state.isLoadingGeminiStatus);
  const isTestingGemini = useSettingsStore((state) => state.isTestingGemini);
  const setGeminiField = useSettingsStore((state) => state.setGeminiField);
  const loadGeminiStatus = useSettingsStore((state) => state.loadGeminiStatus);
  const testGemini = useSettingsStore((state) => state.testGemini);
  const saveConfig = useSettingsStore((state) => state.saveConfig);

  if (isLoadingConfig) {
    return (
      <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
        <CardContent className="flex items-center justify-center p-10">
          <LoaderCircle className="size-5 animate-spin text-stone-400" />
        </CardContent>
      </Card>
    );
  }

  const gemini = config?.gemini ?? {
    enabled: false,
    cookies: { secure_1psid: "", secure_1psidts: "", extra: "" },
    proxy: "",
    default_model: "",
  };
  const status = geminiStatus;
  const accountCount = status?.total ?? 0;
  const usableCount = status?.usable ?? 0;
  const statusBadge = status
    ? status.ready
      ? "Connected"
      : status.configured
        ? "Not connected"
        : "Not configured"
    : "Unknown";

  return (
    <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-stone-900">
              <Bot className="size-5 text-stone-500" />
              Gemini (Google account pool)
            </div>
            <p className="mt-1 text-xs leading-6 text-stone-500">
              Gemini runs on a pool of Google accounts — same pattern as the ChatGPT account pool. Each account keeps its
              web cookies, health status, and usage history; requests pick a healthy account with automatic failover.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span
              className={`rounded-full px-3 py-1 text-xs ${
                status?.ready
                  ? "bg-emerald-50 text-emerald-700"
                  : status?.configured
                    ? "bg-amber-50 text-amber-700"
                    : "bg-stone-100 text-stone-500"
              }`}
            >
              {statusBadge}
            </span>
            <button
              type="button"
              onClick={() => void loadGeminiStatus()}
              disabled={isLoadingGeminiStatus}
              className="cursor-pointer text-xs font-medium text-stone-500 underline-offset-2 transition hover:text-stone-800 hover:underline disabled:opacity-50"
            >
              {isLoadingGeminiStatus ? "Refreshing…" : "Refresh status"}
            </button>
          </div>
        </div>

        {status?.error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-800">
            {status.error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <Users className="size-4 text-stone-400" />
            <div>
              <div className="text-sm font-medium text-stone-700">Account pool</div>
              <div className="text-xs text-stone-500">
                {accountCount > 0
                  ? `${usableCount}/${accountCount} account(s) usable`
                  : "No accounts yet — cookies from the legacy config will be imported automatically"}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="h-9 rounded-full border-stone-200 bg-white text-stone-700"
            onClick={() => window.location.assign("/gemini-accounts")}
          >
            <ExternalLink className="size-3.5" />
            Manage accounts
          </Button>
        </div>

        <div className="space-y-4 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <label className="flex items-center gap-3 text-sm text-stone-700">
            <Checkbox
              checked={Boolean(gemini.enabled)}
              onCheckedChange={(checked) => setGeminiField("enabled", Boolean(checked))}
            />
            Enable Gemini provider
          </label>
          <p className="text-xs leading-5 text-stone-500">
            When enabled, Gemini models are served through /v1/chat/completions, /v1/models, and /v1/images/* using the
            account pool.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-stone-700">Proxy (default for new accounts)</label>
            <Input
              value={gemini.proxy}
              onChange={(event) => setGeminiField("proxy", event.target.value)}
              placeholder="http://127.0.0.1:7890"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">Optional proxy used for Gemini requests when an account has no proxy of its own.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">Default model</label>
            <Input
              value={gemini.default_model}
              onChange={(event) => setGeminiField("default_model", event.target.value)}
              placeholder="gemini-3-flash"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">Used when a request selects the auto model and no Gemini model is specified.</p>
          </div>
        </div>

        {status && status.models.length > 0 ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Detected models ({status.models.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {status.models.map((model) => (
                <span
                  key={model.id}
                  className={`rounded-full px-2.5 py-1 text-xs ${model.is_available ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-500"}`}
                >
                  {model.display_name || model.id}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl border-stone-200 bg-white px-4 text-stone-700"
            onClick={() => void testGemini()}
            disabled={isTestingGemini || accountCount === 0}
          >
            {isTestingGemini ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
            Test connection
          </Button>
          <Button
            className="h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800"
            onClick={() => void saveConfig()}
            disabled={isSavingConfig}
          >
            {isSavingConfig ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
