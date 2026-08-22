"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Clipboard, Code, LoaderCircle, Pencil, Plus, RefreshCw, RotateCcw, Trash2, Zap } from "lucide-react";
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
  addOpenCodeAccount,
  deleteOpenCodeAccount,
  fetchOpenCodeAccounts,
  refreshOpenCodeAccount,
  resetAllOpenCodeAccounts,
  fetchOpenCodeModelsFromSource,
  type OpenCodeAccount,
} from "@/lib/api";

const OPENCODE_MODELS = [
  "grok-4.5", "gpt-5.6-luna", "glm-5.3", "glm-5.2", "glm-5.1", "glm-5",
  "kimi-k2.5", "kimi-k2.6", "kimi-k2.7", "kimi-k3",
  "deepseek-v4-pro", "deepseek-v4-flash",
  "mimo-v2-pro", "mimo-v2-omni", "mimo-v2.5-pro", "mimo-v2.5",
  "hy3", "minimax-m3", "minimax-m2.7", "minimax-m2.5",
  "qwen3.8-max", "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus", "qwen3.5-plus",
];

const PAGE_SIZE = 15;

const STATUS_META: Record<string, { label: string; className: string }> = {
  normal: { label: "Normal", className: "bg-emerald-50 text-emerald-700" },
  abnormal: { label: "Abnormal", className: "bg-rose-50 text-rose-700" },
};

function OpenCodeAccountsContent() {
  const [accounts, setAccounts] = useState<OpenCodeAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ apiKey: "", label: "", modelsText: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<OpenCodeAccount | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchOpenCodeAccounts();
      setAccounts(data.accounts || []);
      setTotal(data.total || 0);
    } catch {
      toast.error("Failed to load OpenCode accounts");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
  const pageAccounts = accounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleAdd = async () => {
    if (!form.apiKey.trim()) {
      toast.error("API key is required");
      return;
    }
    setIsSaving(true);
    try {
      const models = form.modelsText.trim()
        ? form.modelsText.split(",").map((m) => m.trim()).filter(Boolean)
        : OPENCODE_MODELS;
      await addOpenCodeAccount({ api_key: form.apiKey, models, label: form.label });
      toast.success("Account added");
      setDialogOpen(false);
      setForm({ apiKey: "", label: "", modelsText: "" });
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to add account");
    }
    setIsSaving(false);
  };

  const handleRefresh = async (id: string) => {
    setTestingId(id);
    try {
      const result = await refreshOpenCodeAccount(id);
      if (result.ok) {
        toast.success("Account is healthy");
      } else {
        toast.error(`Account unhealthy: ${result.error || "unknown"}`);
      }
      load();
    } catch {
      toast.error("Refresh failed");
    }
    setTestingId(null);
  };

  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    let passed = 0;
    let failed = 0;
    for (const acc of accounts) {
      try {
        const result = await refreshOpenCodeAccount(acc.id);
        if (result.ok) passed++;
        else failed++;
      } catch {
        failed++;
      }
    }
    toast.info(`Refresh complete: ${passed}/${accounts.length} passed`);
    load();
    setIsRefreshingAll(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteOpenCodeAccount(deleteConfirm.id);
      toast.success("Account deleted");
      setDeleteConfirm(null);
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleResetAll = async () => {
    try {
      const result = await resetAllOpenCodeAccounts();
      toast.success(`Reset ${result.reset} accounts`);
      load();
    } catch {
      toast.error("Reset failed");
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Code className="h-6 w-6 text-indigo-600" />
            OpenCode Accounts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage OpenCode proxy accounts — 25+ models via opencode.ai Zen
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleResetAll} disabled={isRefreshingAll}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset All
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={isRefreshingAll}>
            {isRefreshingAll ? <LoaderCircle className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh All
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{total}</div>
            <div className="text-xs text-muted-foreground">Total Accounts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-emerald-600">{accounts.filter((a) => a.status === "normal").length}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-rose-600">{accounts.filter((a) => a.status === "abnormal").length}</div>
            <div className="text-xs text-muted-foreground">Abnormal</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-indigo-600">{OPENCODE_MODELS.length}</div>
            <div className="text-xs text-muted-foreground">Available Models</div>
          </CardContent>
        </Card>
      </div>

      {/* Models Preview */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-2">Available Models ({OPENCODE_MODELS.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {OPENCODE_MODELS.map((m) => (
              <span key={m} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700 font-medium">
                {m}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Accounts Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Code className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No OpenCode accounts yet.</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {pageAccounts.map((acc) => {
              const meta = STATUS_META[acc.status] || STATUS_META.normal;
              return (
                <Card key={acc.id}>
                  <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{acc.label}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Key: {acc.api_key_masked} · Models: {acc.models.length}
                      </div>
                      {acc.last_error && (
                        <div className="text-xs text-rose-500 mt-1 truncate max-w-md">{acc.last_error}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRefresh(acc.id)}
                        disabled={testingId === acc.id}
                      >
                        {testingId === acc.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(acc.api_key_masked); toast.success("Copied"); }}>
                        <Clipboard className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(acc)} className="text-rose-500 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add OpenCode Account</DialogTitle>
            <DialogDescription>
              Enter your OpenCode Zen API key. Get one from{" "}
              <a href="https://opencode.ai/zen" target="_blank" rel="noopener" className="text-indigo-600 underline">
                opencode.ai/zen
              </a>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">API Key</label>
              <Input
                type="password"
                placeholder="sk-..."
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Label (optional)</label>
              <Input
                placeholder="My OpenCode Account"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Models (comma-separated, optional — defaults to all)</label>
              <Input
                placeholder="grok-4.5, kimi-k3, deepseek-v4-pro"
                value={form.modelsText}
                onChange={(e) => setForm({ ...form, modelsText: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={isSaving || !form.apiKey.trim()}>
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Add Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteConfirm?.label}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OpenCodeAccountsPage() {
  const { isCheckingAuth, session } = useAuthGuard();
  if (isCheckingAuth) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }
  if (!session) return null;
  return <OpenCodeAccountsContent />;
}
