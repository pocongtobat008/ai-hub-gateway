"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  fetchDashboardOverview,
  fetchDashboardRecent,
  type DashboardOverview,
  type DashboardRecent,
} from "@/lib/api";

const PROVIDER_META: Record<string, { label: string; color: string; hex: string }> = {
  gpt: { label: "GPT", color: "bg-emerald-500", hex: "#10b981" },
  gemini: { label: "Gemini", color: "bg-blue-500", hex: "#3b82f6" },
  deepseek: { label: "DeepSeek", color: "bg-indigo-500", hex: "#6366f1" },
  grok: { label: "Grok", color: "bg-zinc-500", hex: "#71717a" },
  opencode: { label: "OpenCode", color: "bg-cyan-500", hex: "#06b6d4" },
  custom: { label: "Custom / Local", color: "bg-orange-500", hex: "#f97316" },
  bansos: { label: "Bansos", color: "bg-pink-500", hex: "#ec4899" },
  manus: { label: "Manus", color: "bg-violet-500", hex: "#8b5cf6" },
};

const MODEL_COLORS = [
  "#10b981", "#3b82f6", "#6366f1", "#f97316", "#ec4899",
  "#06b6d4", "#eab308", "#8b5cf6", "#ef4444", "#14b8a6",
];

function providerMeta(provider: string) {
  return PROVIDER_META[provider] ?? { label: provider, color: "bg-slate-500", hex: "#64748b" };
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

/* ── Daily Area Chart ────────────────────────────────────────── */
function DailyAreaChart({ daily }: { daily: DashboardOverview["usage"]["daily"] }) {
  if (daily.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data penggunaan.</p>;
  }
  const data = daily.map((d) => ({
    date: d.date?.slice(5) ?? "",
    requests: d.requests,
    errors: d.errors,
  }));
  return (
    <div className="h-56 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradErrors" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="requests"
            stroke="hsl(var(--primary))"
            fill="url(#gradRequests)"
            strokeWidth={2}
            name="Requests"
          />
          <Area
            type="monotone"
            dataKey="errors"
            stroke="#ef4444"
            fill="url(#gradErrors)"
            strokeWidth={2}
            name="Errors"
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Provider Pie Chart ──────────────────────────────────────── */
function ProviderPieChart({
  providers,
}: {
  providers: DashboardOverview["usage"]["by_provider"];
}) {
  if (providers.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data.</p>;
  }
  const data = providers.map((p) => ({
    name: providerMeta(p.provider ?? "").label,
    value: p.requests,
    errors: p.errors,
    fill: providerMeta(p.provider ?? "").hex,
  }));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="h-52 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) =>
                `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={{ strokeWidth: 1 }}
              style={{ fontSize: 10 }}
            >
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
                fontSize: 12,
              }}
              formatter={(value, name) => [`${value} requests`, String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Legend list */}
      <div className="flex flex-wrap justify-center gap-2">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ background: d.fill }} />
            {d.name}
            <span className="font-medium text-foreground">{d.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Model Horizontal Bar Chart ──────────────────────────────── */
function ModelBarChart({
  models,
}: {
  models: DashboardOverview["usage"]["by_model"];
}) {
  if (models.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data.</p>;
  }
  const data = models.slice(0, 10).map((m) => ({
    name: m.model,
    requests: m.requests,
    errors: m.errors,
  }));
  return (
    <div className="h-72 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis type="number" tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <YAxis
            dataKey="name"
            type="category"
            width={130}
            tick={{ fontSize: 10 }}
            className="text-muted-foreground"
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              fontSize: 12,
            }}
          />
          <Bar dataKey="requests" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Requests" />
          <Bar dataKey="errors" fill="#ef4444" radius={[0, 4, 4, 0]} name="Errors" />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────── */
export default function DashboardPage() {
  const { isCheckingAuth, session } = useAuthGuard();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [recent, setRecent] = useState<DashboardRecent | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, recentData] = await Promise.all([
        fetchDashboardOverview(),
        fetchDashboardRecent().catch(() => null),
      ]);
      setOverview(data);
      if (recentData) setRecent(recentData);
    } catch {
      toast.error("Gagal memuat dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh logic
  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  useEffect(() => {
    if (!autoRefresh || !session) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    setCountdown(30);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Time to refresh
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    intervalRef.current = setInterval(() => {
      void load();
      setCountdown(30);
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh, session, load]);

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
        <div className="flex items-center gap-2">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              autoRefresh
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-muted text-muted-foreground"
            }`}
            title={autoRefresh ? `Auto-refresh aktif (${countdown}s)` : "Auto-refresh mati"}
          >
            <span className={`size-1.5 rounded-full ${autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
            <span className="hidden sm:inline">{autoRefresh ? `${countdown}s` : "Auto"}</span>
          </button>
          <Button variant="outline" size="sm" onClick={() => { void load(); setCountdown(30); }} disabled={loading} className="shrink-0">
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
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

      {/* Usage Area Chart */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold sm:text-base">Riwayat Penggunaan Harian</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">14 hari terakhir</Badge>
          </div>
          <DailyAreaChart daily={usage?.daily ?? []} />
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

      {/* Charts: Pie + Bar side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Provider Pie Chart */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Bot className="size-4 text-primary" />
              <h2 className="text-sm font-semibold sm:text-base">Distribusi Provider</h2>
            </div>
            <ProviderPieChart providers={usage?.by_provider ?? []} />
          </CardContent>
        </Card>

        {/* Model Bar Chart */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Cpu className="size-4 text-primary" />
              <h2 className="text-sm font-semibold sm:text-base">Model Paling Digunakan</h2>
            </div>
            <ModelBarChart models={usage?.by_model ?? []} />
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

      {/* Recent Activity */}
      {recent && (recent.recent_models.length > 0 || recent.recent_providers.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <Cpu className="size-4 text-emerald-500" />
                <h2 className="text-sm font-semibold sm:text-base">Model Terbaru Digunakan</h2>
              </div>
              <div className="flex flex-col gap-1.5">
                {recent.recent_models.map((m, i) => (
                  <div key={m.model} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-stone-800 dark:text-stone-200 truncate">{m.model}</div>
                      <div className="text-[10px] text-stone-400">{m.requests} requests{m.errors > 0 ? ` · ${m.errors} errors` : ""}</div>
                    </div>
                    {m.last_used && (
                      <span className="shrink-0 text-[10px] text-stone-400">{m.last_used}</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <Boxes className="size-4 text-blue-500" />
                <h2 className="text-sm font-semibold sm:text-base">Provider Terbaru Digunakan</h2>
              </div>
              <div className="flex flex-col gap-1.5">
                {recent.recent_providers.map((p, i) => {
                  const meta = providerMeta(p.provider);
                  return (
                    <div key={p.provider} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-stone-100 text-[10px] font-bold text-stone-700 dark:bg-white/10 dark:text-stone-300">
                        {i + 1}
                      </span>
                      <div className={`size-2.5 shrink-0 rounded-full ${meta.color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-stone-800 dark:text-stone-200">{meta.label}</div>
                        <div className="text-[10px] text-stone-400">{p.requests} requests{p.errors > 0 ? ` · ${p.errors} errors` : ""}</div>
                      </div>
                      {p.last_used && (
                        <span className="shrink-0 text-[10px] text-stone-400">{p.last_used}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
