"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clipboard, LoaderCircle, Pencil, Plus, PlugZap, RefreshCw, RotateCcw, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { createBansosAccount, deleteBansosAccount, fetchBansosAccounts, fetchBansosModels, testBansos, testAllBansos, resetBansosAccounts, type BansosAccount } from "@/lib/api";

const STATUS: Record<string, { label: string; cls: string }> = {
  normal: { label: "Normal", cls: "bg-emerald-50 text-emerald-700" },
  abnormal: { label: "Offline", cls: "bg-rose-50 text-rose-700" },
};

function BansosContent() {
  const [accounts, setAccounts] = useState<BansosAccount[]>([]);
  const [availModels, setAvailModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [form, setForm] = useState({ url: "http://127.0.0.1:17070", label: "", modelsText: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [delConfirm, setDelConfirm] = useState<BansosAccount | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [page, setPage] = useState(1);
  const didLoad = useRef(false);
  const PER_PAGE = 15;

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [accData, modelData] = await Promise.all([fetchBansosAccounts(), fetchBansosModels()]);
      setAccounts(accData.accounts);
      setAvailModels(modelData.models);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (!didLoad.current) { didLoad.current = true; void load(); } }, [load]);

  const sorted = [...accounts].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const pageCount = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const paged = sorted.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const handleSave = async () => {
    if (!form.url.trim()) { toast.error("Daemon URL required"); return; }
    const models = form.modelsText.split("\n").map((m) => m.trim()).filter(Boolean);
    if (models.length === 0) { toast.error("Select at least one model"); return; }
    setIsSaving(true);
    try {
      await createBansosAccount({ daemon_url: form.url.trim(), models, label: form.label.trim() });
      toast.success("Account added");
      setDlgOpen(false);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setIsSaving(false); }
  };

  const handleDelete = async (acc: BansosAccount) => {
    try { await deleteBansosAccount(acc.id); toast.success("Deleted"); setDelConfirm(null); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const handleTest = async (acc: BansosAccount) => {
    setTestingId(acc.id);
    try {
      const d = await testBansos({ account_id: acc.id });
      d.ok ? toast.success(`${acc.label}: works!`) : toast.error(`Failed: ${d.error}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Test failed"); }
    finally { setTestingId(null); }
  };

  const handleRefreshOne = async (acc: BansosAccount) => {
    setRefreshingId(acc.id);
    try {
      const d = await testBansos({ account_id: acc.id });
      d.ok ? toast.success(`${acc.label}: OK`) : toast.error(`${acc.label}: ${d.error}`);
      await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setRefreshingId(null); }
  };

  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    try {
      toast.info("Testing all...");
      const d = await testAllBansos();
      await load(true);
      d.failed > 0 ? toast.warning(`${d.passed} OK, ${d.failed} failed`) : toast.success(`All ${d.passed} OK!`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setIsRefreshingAll(false); }
  };

  const handleResetAll = async () => {
    setIsResetting(true);
    try { const d = await resetBansosAccounts(); await load(); toast.success(`Reset ${d.reset}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setIsResetting(false); }
  };

  const toggleModel = (m: string) => {
    const lines = form.modelsText.split("\n").map((l) => l.trim()).filter(Boolean);
    const idx = lines.indexOf(m);
    if (idx >= 0) lines.splice(idx, 1); else lines.push(m);
    setForm({ ...form, modelsText: lines.join("\n") });
  };
  const selectedSet = new Set(form.modelsText.split("\n").map((l) => l.trim()).filter(Boolean));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Bansos Accounts
            <span className="ml-3 inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {accounts.length} Free
            </span>
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Free keyless coding models via bansos-router daemon</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHelp(!showHelp)} className="gap-1.5"><Clipboard className="size-4" /> Guide</Button>
          <Button variant="outline" size="sm" onClick={() => void handleRefreshAll()} disabled={isRefreshingAll || isResetting || !accounts.length} className="gap-1.5">
            <RefreshCw className={`size-4 ${isRefreshingAll ? "animate-spin" : ""}`} /> Refresh All
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleResetAll()} disabled={isRefreshingAll || isResetting} className="gap-1.5">
            <RotateCcw className={`size-4 ${isResetting ? "animate-spin" : ""}`} /> Reset
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setForm({ url: "http://127.0.0.1:17070", label: "", modelsText: "deepseek-v4-flash-free" }); setDlgOpen(true); }}>
            <Plus className="size-4" /> Add Daemon
          </Button>
        </div>
      </div>

      {showHelp && (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20">
          <CardContent className="p-4 text-sm space-y-2">
            <div className="font-semibold text-emerald-800 dark:text-emerald-300">Free models, no API key needed</div>
            <ol className="list-decimal list-inside space-y-1 text-emerald-700 dark:text-emerald-400 text-xs">
              <li>Install bansos-router: <code>npm i -g bansos-router</code></li>
              <li>Start daemon: <code>bansos start --bg</code></li>
              <li>Add account with URL <code>http://127.0.0.1:17070</code></li>
              <li>Select free models → Add</li>
            </ol>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-500">
              <strong>Free models:</strong> deepseek-v4-flash-free, mimo-v2.5-free, nemotron-3-ultra, kilo-auto/free, and more.
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{accounts.length}</div><div className="text-xs text-stone-500">Total</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-emerald-600">{accounts.filter((a) => a.status === "normal").length}</div><div className="text-xs text-stone-500">Active</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-amber-600">{accounts.filter((a) => a.status !== "normal").length}</div><div className="text-xs text-stone-500">Issues</div></CardContent></Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>
      ) : accounts.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Zap className="mb-3 size-8 text-stone-300 dark:text-stone-600" />
          <div className="text-sm font-medium text-stone-600 dark:text-stone-400">No bansos daemons configured</div>
          <div className="mt-1 text-xs text-stone-400">Start bansos-router and add it here</div>
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => { setForm({ url: "http://127.0.0.1:17070", label: "", modelsText: "deepseek-v4-flash-free" }); setDlgOpen(true); }}><Plus className="size-4" /> Add Daemon</Button>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {paged.map((acc) => {
            const meta = STATUS[acc.status] || STATUS.normal;
            return (
              <Card key={acc.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{acc.label || "Bansos"}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}>{meta.label}</span>
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Free</span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-stone-500 dark:text-stone-400 truncate">{acc.daemon_url}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(acc.models || []).slice(0, 4).map((m) => (
                          <span key={m} className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">{m}</span>
                        ))}
                        {(acc.models || []).length > 4 && <span className="text-[10px] text-stone-400">+{(acc.models || []).length - 4}</span>}
                      </div>
                      {acc.last_error && <div className="mt-1 text-[11px] text-rose-500 truncate">{acc.last_error}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="sm" className="gap-1 h-7 px-2 text-[11px]" onClick={() => void handleTest(acc)} disabled={testingId === acc.id}>
                        {testingId === acc.id ? <LoaderCircle className="size-3 animate-spin" /> : <PlugZap className="size-3" />} Test
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => void handleRefreshOne(acc)} disabled={refreshingId === acc.id}>
                        {refreshingId === acc.id ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-rose-500 hover:text-rose-600" onClick={() => setDelConfirm(acc)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" className="size-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}><ChevronLeft className="size-4" /></Button>
          <span className="text-sm text-stone-500">{safePage}/{pageCount}</span>
          <Button variant="outline" size="icon" className="size-8" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}><ChevronRight className="size-4" /></Button>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Bansos Daemon</DialogTitle>
            <DialogDescription>Connect to a running bansos-router daemon.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Daemon URL</label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="http://127.0.0.1:17070" className="font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Select Free Models</label>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-stone-200 p-2 dark:border-white/10">
                {availModels.map((m) => (
                  <button key={m} type="button" onClick={() => toggleModel(m)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${selectedSet.has(m) ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-white/5"}`}>
                    <div className={`flex size-4 items-center justify-center rounded border ${selectedSet.has(m) ? "border-emerald-500 bg-emerald-500 text-white" : "border-stone-300 dark:border-stone-600"}`}>
                      {selectedSet.has(m) && <Check className="size-3" />}
                    </div>
                    <span className="font-mono">{m}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-stone-400">{selectedSet.size} models selected</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Label</label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="My Bansos Daemon" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : null}Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!delConfirm} onOpenChange={() => setDelConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Daemon</DialogTitle><DialogDescription>Remove this bansos account?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => delConfirm && void handleDelete(delConfirm)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BansosAccountsPage() {
  const { isCheckingAuth } = useAuthGuard(["admin"]);
  if (isCheckingAuth) return <div className="flex min-h-[50vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  return <BansosContent />;
}
