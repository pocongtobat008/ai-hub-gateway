"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clipboard, Globe, LoaderCircle, Pencil, Plus, PlugZap, RefreshCw, RotateCcw, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  createCustomAccount,
  deleteCustomAccount,
  fetchCustomAccounts,
  testCustom,
  testAllCustom,
  resetCustomAccounts,
  validateCustomModels,
  type CustomAccount,
} from "@/lib/api";

const STATUS_META: Record<string, { label: string; className: string }> = {
  normal: { label: "Normal", className: "bg-emerald-50 text-emerald-700" },
  rate_limited: { label: "Rate limited", className: "bg-amber-50 text-amber-700" },
  abnormal: { label: "Abnormal", className: "bg-rose-50 text-rose-700" },
  disabled: { label: "Disabled", className: "bg-stone-100 text-stone-500" },
};

function CustomAccountsContent() {
  const [accounts, setAccounts] = useState<CustomAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomAccount | null>(null);
  const [form, setForm] = useState({ baseUrl: "", apiKey: "", label: "", modelsText: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<CustomAccount | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [page, setPage] = useState(1);
  const didLoadRef = useRef(false);
  const PER_PAGE = 15;

  const loadAccounts = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchCustomAccounts();
      setAccounts(data.accounts);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Failed to load accounts");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void loadAccounts();
  }, [loadAccounts]);

  const openAdd = () => {
    setEditing(null);
    setForm({ baseUrl: "", apiKey: "", label: "", modelsText: "" });
    setDialogOpen(true);
  };

  const openEdit = (account: CustomAccount) => {
    setEditing(account);
    setForm({
      baseUrl: account.base_url,
      apiKey: "",
      label: account.label || "",
      modelsText: (account.models || []).join("\n"),
    });
    setDialogOpen(true);
  };

  const handleFetchModels = async () => {
    if (!form.baseUrl.trim()) {
      toast.error("Enter a base URL first");
      return;
    }
    setIsFetching(true);
    try {
      const data = await validateCustomModels({ base_url: form.baseUrl.trim(), api_key: form.apiKey.trim() });
      if (data.ok && data.models.length > 0) {
        // Append fetched models to existing text (deduplicate)
        const existing = form.modelsText.split("\n").map((m) => m.trim()).filter(Boolean);
        const allModels = [...new Set([...existing, ...data.models])];
        setForm({ ...form, modelsText: allModels.join("\n") });
        toast.success(`Found ${data.models.length} models! Select the ones you want.`);
      } else {
        toast.warning("No models found. Check URL and API key, or type models manually.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fetch failed");
    } finally {
      setIsFetching(false);
    }
  };

  const handleSave = async () => {
    if (!form.baseUrl.trim()) {
      toast.error("Base URL is required");
      return;
    }
    const models = form.modelsText.split("\n").map((m) => m.trim()).filter(Boolean);
    if (models.length === 0) {
      toast.error("Add at least one model (one per line)");
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        await deleteCustomAccount(editing.id);
      }
      await createCustomAccount({
        base_url: form.baseUrl.trim(),
        api_key: form.apiKey.trim(),
        models,
        label: form.label.trim() || "",
      });
      toast.success(editing ? "Account updated" : "Account added");
      setDialogOpen(false);
      await loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save account");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (account: CustomAccount) => {
    try {
      await deleteCustomAccount(account.id);
      toast.success("Account deleted");
      setDeleteConfirm(null);
      await loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    }
  };

  const handleTest = async (account: CustomAccount) => {
    setTestingId(account.id);
    try {
      const data = await testCustom({ account_id: account.id });
      if (data.ok) {
        toast.success(`${account.label || "Account"}: works!`);
      } else {
        toast.error(`Test failed: ${data.error}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  };

  const handleRefreshOne = async (account: CustomAccount) => {
    setRefreshingId(account.id);
    try {
      const data = await testCustom({ account_id: account.id });
      if (data.ok) {
        toast.success(`${account.label || "Account"}: refreshed OK`);
      } else {
        toast.error(`${account.label || "Account"}: ${data.error}`);
      }
      await loadAccounts(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setRefreshingId(null);
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    try {
      toast.info("Testing all accounts...");
      const data = await testAllCustom();
      await loadAccounts(true);
      if (data.failed > 0) {
        toast.warning(`Refreshed: ${data.passed} OK, ${data.failed} failed (out of ${data.total})`);
      } else {
        toast.success(`All ${data.passed} accounts OK!`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const handleResetAll = async () => {
    setIsResetting(true);
    try {
      const data = await resetCustomAccounts();
      await loadAccounts();
      toast.success(`Reset ${data.reset} accounts to normal`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setIsResetting(false);
    }
  };

  const sortedAccounts = [...accounts].sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return db - da;
  });
  const pageCount = Math.max(1, Math.ceil(sortedAccounts.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const startIdx = (safePage - 1) * PER_PAGE;
  const pagedAccounts = sortedAccounts.slice(startIdx, startIdx + PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Custom / Local Providers</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Add any OpenAI-compatible API — Ollama, vLLM, LM Studio, local servers, etc.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHelp(!showHelp)} className="gap-1.5">
            <Clipboard className="size-4" /> Guide
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleRefreshAll()} disabled={isRefreshingAll || isResetting || accounts.length === 0} className="gap-1.5">
            <RefreshCw className={`size-4 ${isRefreshingAll ? "animate-spin" : ""}`} /> Refresh All
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleResetAll()} disabled={isRefreshingAll || isResetting} className="gap-1.5">
            <RotateCcw className={`size-4 ${isResetting ? "animate-spin" : ""}`} /> Reset All
          </Button>
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus className="size-4" /> Add Provider
          </Button>
        </div>
      </div>

      {showHelp && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="p-4 text-sm space-y-2">
            <div className="font-semibold text-blue-800 dark:text-blue-300">How to add a provider</div>
            <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-400 text-xs">
              <li>Enter the <strong>Base URL</strong> (e.g. <code>http://localhost:11434</code>)</li>
              <li>Enter <strong>API Key</strong> if needed (leave empty if not)</li>
              <li>Click <strong>Fetch Models</strong> or type models manually (one per line)</li>
              <li>Click <strong>Add</strong></li>
            </ol>
            <div className="text-[11px] text-blue-600 dark:text-blue-500">
              <strong>Examples:</strong> Ollama <code>localhost:11434</code> · LM Studio <code>localhost:1234</code> · vLLM <code>localhost:8000</code>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center">
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{accounts.length}</div>
          <div className="text-xs text-stone-500">Total</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600">{accounts.filter((a) => a.status === "normal").length}</div>
          <div className="text-xs text-stone-500">Active</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{accounts.filter((a) => a.status !== "normal").length}</div>
          <div className="text-xs text-stone-500">Issues</div>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>
      ) : accounts.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Globe className="mb-3 size-8 text-stone-300 dark:text-stone-600" />
          <div className="text-sm font-medium text-stone-600 dark:text-stone-400">No custom providers configured</div>
          <div className="mt-1 text-xs text-stone-400">Add an OpenAI-compatible endpoint to get started</div>
          <Button onClick={openAdd} size="sm" className="mt-4 gap-1.5"><Plus className="size-4" /> Add Provider</Button>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pagedAccounts.map((account) => {
            const meta = STATUS_META[account.status] || STATUS_META.normal;
            return (
              <Card key={account.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{account.label || "Custom"}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>{meta.label}</span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-stone-500 dark:text-stone-400 truncate">{account.base_url}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(account.models || []).slice(0, 4).map((m) => (
                          <span key={m} className="inline-flex items-center rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-400">{m}</span>
                        ))}
                        {(account.models || []).length > 4 && (
                          <span className="text-[10px] text-stone-400">+{(account.models || []).length - 4}</span>
                        )}
                      </div>
                      {account.last_error && <div className="mt-1 text-[11px] text-rose-500 truncate">{account.last_error}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="sm" className="gap-1 h-7 px-2 text-[11px]" onClick={() => void handleTest(account)} disabled={testingId === account.id}>
                        {testingId === account.id ? <LoaderCircle className="size-3 animate-spin" /> : <PlugZap className="size-3" />} Test
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 h-7 px-2 text-[11px]" onClick={() => void handleRefreshOne(account)} disabled={refreshingId === account.id}>
                        {refreshingId === account.id ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(account)}><Pencil className="size-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="size-7 text-rose-500 hover:text-rose-600" onClick={() => setDeleteConfirm(account)}><Trash2 className="size-3.5" /></Button>
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
          <Button variant="outline" size="icon" className="size-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-stone-500">{safePage} / {pageCount} ({sortedAccounts.length})</span>
          <Button variant="outline" size="icon" className="size-8" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Provider" : "Add Custom Provider"}</DialogTitle>
            <DialogDescription>Connect any OpenAI-compatible API endpoint.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Base URL *</label>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="http://localhost:11434"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">API Key</label>
              <Input
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-... (leave empty if not needed)"
                className="font-mono text-xs"
                type="password"
              />
            </div>

            {/* Fetch Models button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleFetchModels()}
              disabled={isFetching || !form.baseUrl.trim()}
              className="gap-1.5"
            >
              {isFetching ? <LoaderCircle className="size-4 animate-spin" /> : <Zap className="size-4" />}
              Fetch Models from Server
            </Button>

            {/* Models textarea */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                Models <span className="text-stone-400 font-normal">(one per line)</span>
              </label>
              <textarea
                value={form.modelsText}
                onChange={(e) => setForm({ ...form, modelsText: e.target.value })}
                placeholder={"llama-3.1-8b\ncodellama-13b\nmistral-7b"}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-white/5 min-h-[100px]"
                rows={5}
              />
              <p className="text-[11px] text-stone-400">
                Type model names or click Fetch Models to auto-detect
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Label</label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="My Ollama Server" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !form.baseUrl.trim()}>
              {isSaving ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : null}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Provider</DialogTitle>
            <DialogDescription>Delete this custom provider?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && void handleDelete(deleteConfirm)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CustomAccountsPage() {
  const { isCheckingAuth } = useAuthGuard(["admin"]);
  if (isCheckingAuth) {
    return <div className="flex min-h-[50vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }
  return <CustomAccountsContent />;
}
