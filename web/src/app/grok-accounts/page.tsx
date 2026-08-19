"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Pencil, Plus, PlugZap, Trash2, Zap } from "lucide-react";
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
  createGrokAccount,
  deleteGrokAccount,
  fetchGrokAccounts,
  testGrok,
  updateGrokAccount,
  type GrokAccount,
} from "@/lib/api";

const STATUS_META: Record<string, { label: string; className: string }> = {
  normal: { label: "Normal", className: "bg-emerald-50 text-emerald-700" },
  rate_limited: { label: "Rate limited", className: "bg-amber-50 text-amber-700" },
  abnormal: { label: "Abnormal", className: "bg-rose-50 text-rose-700" },
  disabled: { label: "Disabled", className: "bg-stone-100 text-stone-500" },
};

type FormState = {
  sso: string;
  label: string;
  proxy: string;
};

const EMPTY_FORM: FormState = {
  sso: "",
  label: "",
  proxy: "",
};

function GrokAccountsContent() {
  const [accounts, setAccounts] = useState<GrokAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GrokAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<GrokAccount | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const didLoadRef = useRef(false);

  const loadAccounts = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const data = await fetchGrokAccounts();
      setAccounts(data.accounts);
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "Failed to load Grok accounts");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadAccounts();
  }, [loadAccounts]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (account: GrokAccount) => {
    setEditing(account);
    setForm({
      sso: "",
      label: account.label || "",
      proxy: account.proxy || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editing && !form.sso.trim()) {
      toast.error("SSO cookie is required");
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        const updates: Record<string, string> = {};
        if (form.sso.trim()) updates.sso = form.sso.trim();
        if (form.label !== undefined) updates.label = form.label.trim();
        if (form.proxy !== undefined) updates.proxy = form.proxy.trim();
        const data = await updateGrokAccount(editing.id, updates);
        setAccounts(data.accounts);
        toast.success("Account updated");
      } else {
        const data = await createGrokAccount({
          sso: form.sso.trim(),
          label: form.label.trim(),
          proxy: form.proxy.trim(),
        });
        setAccounts(data.accounts);
        toast.success("Account added");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save account");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (account: GrokAccount) => {
    try {
      const data = await deleteGrokAccount(account.id);
      setAccounts(data.accounts);
      toast.success("Account deleted");
      setDeleteConfirm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    }
  };

  const handleTest = async (account: GrokAccount) => {
    setTestingId(account.id);
    try {
      const data = await testGrok({ sso: account.sso || "" });
      if (data.result.ok) {
        toast.success(`Account works! Name: ${data.result.name || "Grok User"}`);
      } else {
        toast.error(`Test failed: ${data.result.error}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Grok Accounts
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Manage Grok SSO cookies for round-robin rotation.
          </p>
        </div>
        <Button onClick={openAdd} size="sm" className="gap-1.5">
          <Plus className="size-4" />
          Add Account
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">
              {accounts.length}
            </div>
            <div className="text-xs text-stone-500">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-emerald-600">
              {accounts.filter((a) => a.status === "normal").length}
            </div>
            <div className="text-xs text-stone-500">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">
              {accounts.filter((a) => a.status === "rate_limited").length}
            </div>
            <div className="text-xs text-stone-500">Rate Limited</div>
          </CardContent>
        </Card>
      </div>

      {/* Account list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoaderCircle className="size-5 animate-spin text-stone-400" />
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="mb-3 size-8 text-stone-300 dark:text-stone-600" />
            <div className="text-sm font-medium text-stone-600 dark:text-stone-400">
              No Grok accounts configured
            </div>
            <div className="mt-1 text-xs text-stone-400">
              Add an SSO cookie to get started
            </div>
            <Button onClick={openAdd} size="sm" className="mt-4 gap-1.5">
              <Plus className="size-4" />
              Add Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((account) => {
            const meta = STATUS_META[account.status] || STATUS_META.normal;
            return (
              <Card key={account.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                          {account.label || "Grok Account"}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-stone-500 dark:text-stone-400">
                        {account.sso || "••••••••"}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-stone-400">
                        <span>✓ {account.success || 0}</span>
                        <span>✗ {account.fail || 0}</span>
                        {account.last_error && (
                          <span className="truncate text-rose-500">{account.last_error}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => void handleTest(account)}
                        disabled={testingId === account.id}
                        title="Test connection"
                      >
                        {testingId === account.id ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <PlugZap className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(account)}
                        title="Edit"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-rose-500 hover:text-rose-600"
                        onClick={() => setDeleteConfirm(account)}
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Account" : "Add Grok Account"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the account settings."
                : "Paste your Grok SSO cookie (sso=...). Get it from browser DevTools → Application → Cookies → grok.com."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                SSO Cookie *
              </label>
              <Input
                value={form.sso}
                onChange={(e) => setForm({ ...form, sso: e.target.value })}
                placeholder="sso=AAAAAA-xxxxx..."
                className="font-mono text-xs"
                disabled={!!editing}
              />
              {editing && (
                <p className="text-[11px] text-stone-400">
                  Leave empty to keep current cookie.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                Label
              </label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Main account"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                Proxy (optional)
              </label>
              <Input
                value={form.proxy}
                onChange={(e) => setForm({ ...form, proxy: e.target.value })}
                placeholder="http://user:pass@host:port"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? (
                <LoaderCircle className="mr-1.5 size-4 animate-spin" />
              ) : null}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this Grok account? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && void handleDelete(deleteConfirm)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function GrokAccountsPage() {
  const { ready } = useAuthGuard();
  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }
  return <GrokAccountsContent />;
}
