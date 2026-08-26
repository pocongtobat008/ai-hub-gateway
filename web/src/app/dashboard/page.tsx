"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  Cpu,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  fetchDashboardOverview,
  type DashboardOverview,
} from "@/lib/api";

const PROVIDER_META: Record<string, { label: string; color: string }> = {
  gpt: { label: "GPT", color: "bg-emerald-500" },
  gemini: { label: "Gemini", color: "bg-blue-500" },
  deepseek: { label: "DeepSeek", color: "bg-indigo-500" },
  grok: { label: "Grok", color: "bg-zinc-500" },
  opencode: { label: "OpenCode", color: "bg-cyan-500" },
  custom: { label: "Custom / Local", color: "bg-orange-500" },
  bansos: { label: "Bansos", color: "bg-pink-500" },
  manus: { label: "Manus", color: "bg-violet-500" },
};

function providerMeta(provider: string) {
  return PROVIDER_META[provider] ?? { label: provider, color: "bg-slate-500" };
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : "";
  return (
    <Card className="min-w-0">
      <CardContent className="flex items-center gap-3 p-4 sm:p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className={`truncate text-xl font-bold sm:text-2xl ${toneClass}`}>{value}</p>
          {sub ? <p className="truncate text-xs text-muted-foreground">{sub}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DailyChart({ daily }: { daily: DashboardOverview["usage"]["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.requests));
  if (daily.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data penggunaan.</p>
    );
  }
  return (
    <div className="flex h-40 items-end gap-1.5 overflow-x-auto pb-1 sm:h-48 sm:gap-2">
      {daily.map((day) => {
        const heightPct = Math.max(4, (day.requests / max) * 100);
        const errorPct = day.requests > 0 ? (day.errors / max) * 100 : 0;
        return (
          <div key={day.date} className="flex min-w-[24px] flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">{day.requests}</span>
            <div
              className="relative w-full max-w-[36px] flex-1 overflow-hidden rounded-md bg-muted"
              title={`${day.date}: ${day.requests} requests, ${day.errors} errors`}
            >
              <div
                className="absolute bottom-0 w-full rounded-md bg-primary/80 transition-all"
                style={{ height: `${heightPct}%` }}
              />
              {errorPct > 0 ? (
                <div
                  className="absolute bottom-0 w-full bg-red-500/70"
                  style={{ height: `${Math.min(errorPct, heightPct)}%` }}
                />
              ) : null}
            </div>
            <span className="whitespace-nowrap text-[9px] text-muted-foreground">
              {day.date?.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const { isCheckingAuth, session } = useAuthGuard();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardOverview();
      setOverview(data);
    } catch {
      toast.error("Gagal memuat dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return null;

  const totals = overview?.totals;
  const usage = overview?.usage;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 sm:gap-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <LayoutDashboard className="size-5 shrink-0 text-primary sm:size-6" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold sm:text-2xl">Dashboard</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              Monitoring model, penggunaan & status akun
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="shrink-0">
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
        <StatCard icon={<Users className="size-5" />} label="Total Akun" value={totals?.accounts ?? "—"} sub={`${totals?.providers ?? 0} provider`} />
        <StatCard
          icon={<CheckCircle2 className="size-5" />}
          label="Akun Sehat"
          value={totals ? `${totals.healthy_accounts}/${totals.accounts}` : "—"}
          sub="status normal"
          tone={totals && totals.healthy_accounts === totals.accounts ? "success" : "warning"}
        />
        <StatCard icon={<Activity className="size-5" />} label="Total Request (14 hari)" value={usage?.total_requests ?? 0} sub="semua provider" />
        <StatCard
          icon={<AlertTriangle className="size-5" />}
          label="Error (14 hari)"
          value={usage?.total_errors ?? 0}
          sub={usage && usage.total_requests > 0 ? `${Math.round((usage.total_errors / usage.total_requests) * 100)}% error rate` : "tidak ada"}
          tone={(usage?.total_errors ?? 0) > 0 ? "danger" : "success"}
        />
      </div>

      {/* Usage chart */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold sm:text-base">Riwayat Penggunaan Harian</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">14 hari terakhir</Badge>
          </div>
          <DailyChart daily={usage?.daily ?? []} />
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary/80" /> Requests</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-red-500/70" /> Errors</span>
          </div>
        </CardContent>
      </Card>

      {/* Account status per provider */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <h2 className="text-sm font-semibold sm:text-base">Status Akun per Provider</h2>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
            {(overview?.accounts ?? []).map((acct) => {
              const meta = providerMeta(acct.provider);
              const normal = acct.statuses["normal"] ?? 0;
              const limited = acct.statuses["rate_limited"] ?? 0;
              const other = acct.total - normal - limited;
              const allHealthy = normal === acct.total;
              return (
                <div key={acct.provider} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className={`size-2.5 shrink-0 rounded-full ${meta.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {normal} normal{limited > 0 ? ` · ${limited} limit` : ""}
                      {other > 0 ? ` · ${other} issue` : ""}
                    </p>
                  </div>
                  {acct.models ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{acct.models} models</Badge>
                  ) : null}
                  <Badge variant={allHealthy ? "outline" : "danger"} className="shrink-0 text-[10px]">
                    {allHealthy ? "OK" : `${normal}/${acct.total}`}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top models */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Cpu className="size-4 text-primary" />
              <h2 className="text-sm font-semibold sm:text-base">Model Paling Digunakan</h2>
            </div>
            {(usage?.by_model ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(usage?.by_model ?? []).slice(0, 10).map((m) => {
                  const topMax = usage?.by_model?.[0]?.requests || 1;
                  return (
                    <div key={m.model} className="flex items-center gap-2.5">
                      <code className="w-32 shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-xs sm:w-44">{m.model}</code>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(4, (m.requests / topMax) * 100)}%` }} />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {m.requests}×{m.errors > 0 ? ` ⚠${m.errors}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage per provider */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Bot className="size-4 text-primary" />
              <h2 className="text-sm font-semibold sm:text-base">Penggunaan per Provider</h2>
            </div>
            {(usage?.by_provider ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(usage?.by_provider ?? []).map((p) => {
                  const meta = providerMeta(p.provider ?? "");
                  const topMax = usage?.by_provider?.[0]?.requests || 1;
                  return (
                    <div key={p.provider} className="flex items-center gap-2.5">
                      <span className={`size-2 shrink-0 rounded-full ${meta.color}`} />
                      <span className="w-20 shrink-0 truncate text-xs font-medium sm:w-24">{meta.label}</span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${meta.color}/70`} style={{ width: `${Math.max(4, (p.requests / topMax) * 100)}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {p.requests}×{p.errors > 0 ? ` ⚠${p.errors}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Model summary (Gemini catalog) */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Boxes className="size-4 text-primary" />
            <h2 className="text-sm font-semibold sm:text-base">Ringkasan Model Gemini</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(overview?.gemini_catalog ?? []).map((m) => (
              <Badge key={m.id} variant="secondary" className="gap-1.5 py-1 text-[11px] font-normal">
                <span className="font-semibold">{m.display_name}</span>
                <span className="text-muted-foreground">· {m.capabilities.join(", ")}</span>
                {m.tier !== "free" ? <span className="rounded bg-amber-500/15 px-1 text-[9px] font-semibold uppercase text-amber-600 dark:text-amber-400">{m.tier}</span> : null}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent errors */}
      {(usage?.recent_errors ?? []).length > 0 ? (
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="size-4 text-red-500" />
              <h2 className="text-sm font-semibold sm:text-base">Error Terakhir</h2>
            </div>
            <div className="flex flex-col gap-1.5">
              {(usage?.recent_errors ?? []).slice(0, 8).map((e, i) => (
                <div key={`${e.ts}-${i}`} className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-xs">
                  <code className="shrink-0 font-semibold text-red-600 dark:text-red-400">{e.provider}</code>
                  <code className="w-28 shrink-0 truncate text-muted-foreground">{e.model}</code>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{e.error || "unknown error"}</span>
                  <span className="hidden shrink-0 text-muted-foreground sm:inline">
                    {e.ts ? new Date(e.ts * 1000).toLocaleTimeString("id-ID") : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
