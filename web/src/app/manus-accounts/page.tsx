"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clipboard, LoaderCircle, Pencil, Plus, PlugZap, RefreshCw, RotateCcw, Trash2, Zap } from "lucide-react";
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
  createManusAccount,
  deleteManusAccount,
  fetchManusAccounts,
  testManus,
  testAllManus,
  resetManusAccounts,
  type ManusAccount,
} from "@/lib/api";

const STATUS_META: Record<string, { label: string; className: string }> = {
  normal: { label: "Normal", className: "bg-emerald-50 text-emerald-700" },
  rate_limited: { label: "Rate limited", className: "bg-amber-50 text-amber-700" },
  abnormal: { label: "Abnormal", className: "bg-rose-50 text-rose-700" },
  disabled: { label: "Disabled", className: "bg-stone-100 text-stone-500" },
};

function ManusAccountsContent() {
  const [accounts, setAccounts] = useState<ManusAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ apiKey: "", label: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ManusAccount | null>(null);
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
      const data = await fetchManusAccounts();
      setAccounts(data.accounts);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Failed to load Manus accounts");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void loadAccounts();
  }, [loadAccounts]);

  const openAdd = () => { setForm({ apiKey: "", label: "" }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.apiKey.trim()) {
      toast.error("API key is required");
      return;
    }
    setIsSaving(true);
    try {
      await createManusAccount({ api_key: form.apiKey.trim(), label: form.label.trim() });
      toast.success("Account added");
      setDialogOpen(false);
      await loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add account");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (account: ManusAccount) => {
    try {
      await deleteManusAccount(account.id);
      toast.success("Account deleted");
      setDeleteConfirm(null);
      await loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    }
  };

  const handleTest = async (account: ManusAccount) => {
    setTestingId(account.id);
    try {
      const data = await testManus({ account_id: account.id });
      if (data.ok) {
        toast.success("Account works!");
      } else {
        toast.error(`Test failed: ${data.error}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  };

  const handleRefreshOne = async (account: ManusAccount) => {
    setRefreshingId(account.id);
    try {
      const data = await testManus({ account_id: account.id });
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
      const data = await testAllManus();
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
      const data = await resetManusAccounts();
      await loadAccounts();
      toast.success(`Reset ${data.reset} accounts to normal`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setIsResetting(false);
    }
  };

  // Sort newest first
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
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Manus Accounts</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Manage Manus API keys for round-robin rotation. Models: manus-1.6, agent-default-main_task.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHelp(!showHelp)}
            className="gap-1.5"
          >
            <Clipboard className="size-4" />
            Setup Guide
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRefreshAll()}
            disabled={isRefreshingAll || isResetting || accounts.length === 0}
            className="gap-1.5"
          >
            <RefreshCw className={`size-4 ${isRefreshingAll ? "animate-spin" : ""}`} />
            Refresh All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleResetAll()}
            disabled={isRefreshingAll || isResetting}
            className="gap-1.5"
          >
            <RotateCcw className={`size-4 ${isResetting ? "animate-spin" : ""}`} />
            Reset All
          </Button>
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus className="size-4" />
            Add Account
          </Button>
        </div>
      </div>

      {showHelp && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="p-4 text-sm space-y-3">
            <div className="font-semibold text-blue-800 dark:text-blue-300">🔑 How to get a Manus API Key</div>
            <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-400">
              <li>Go to <a href="https://manus.im" target="_blank" className="underline font-medium">manus.im</a></li>
              <li>Sign up / login to your Manus account</li>
              <li>Go to <strong>API Settings</strong> → <strong>Create API Key</strong></li>
              <li>Copy the key</li>
              <li>Paste it in the form below</li>
            </ol>
            <div className="text-xs text-blue-600 dark:text-blue-500">
              Each API key provides full access to the associated Manus account. Keep keys private.
            </div>
            <div className="font-semibold text-blue-800 dark:text-blue-300 pt-2">Models Available</div>
            <ul className="list-disc list-inside text-blue-700 dark:text-blue-400 text-xs">
              <li><code>manus-1.6</code> — Main Manus agent</li>
              <li><code>agent-default-main_task</code> — Default task agent</li>
              <li>Custom agents discovered from your account</li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
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
          <div className="text-2xl font-bold text-amber-600">{accounts.filter((a) => a.status === "rate_limited" || a.status === "abnormal").length}</div>
          <div className="text-xs text-stone-500">Issues</div>
        </CardContent></Card>
      </div>

      {/* Account list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>
      ) : accounts.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Zap className="mb-3 size-8 text-stone-300 dark:text-stone-600" />
          <div className="text-sm font-medium text-stone-600 dark:text-stone-400">No Manus accounts configured</div>
          <div className="mt-1 text-xs text-stone-400">Add a Manus API key to get started</div>
          <Button onClick={openAdd} size="sm" className="mt-4 gap-1.5"><Plus className="size-4" /> Add Account</Button>
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
                        <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{account.label || "Manus Account"}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>{meta.label}</span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-stone-500 dark:text-stone-400">
                        {account.api_key_masked}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-stone-400">
                        {account.last_error && <span className="truncate text-rose-500">{account.last_error}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3 text-xs" onClick={() => void handleTest(account)} disabled={testingId === account.id} title="Test">
                        {testingId === account.id ? <LoaderCircle className="size-3 animate-spin" /> : <PlugZap className="size-3" />} Test
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3 text-xs" onClick={() => void handleRefreshOne(account)} disabled={refreshingId === account.id || testingId === account.id} title="Refresh">
                        {refreshingId === account.id ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Refresh
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-rose-500 hover:text-rose-600" onClick={() => setDeleteConfirm(account)} title="Delete"><Trash2 className="size-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-stone-500 dark:text-stone-400">
            Page {safePage} / {pageCount} ({sortedAccounts.length} accounts)
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage >= pageCount}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Manus Account</DialogTitle>
            <DialogDescription>
              Enter your Manus API key. Get one at manus.im → API Settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Manus API Key *</label>
              <Input
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="manus-api-key..."
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-stone-400">
                Get your key at <a href="https://manus.im" target="_blank" className="underline">manus.im</a> → API Settings
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Label (optional)</label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Main account" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : null}
              Add Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>Are you sure you want to delete this Manus account?</DialogDescription>
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

export default function ManusAccountsPage() {
  const { isCheckingAuth } = useAuthGuard(["admin"]);
  if (isCheckingAuth) {
    return <div className="flex min-h-[50vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }
  return <ManusAccountsContent />;
}
