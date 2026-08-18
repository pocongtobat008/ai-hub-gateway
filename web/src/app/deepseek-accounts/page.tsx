"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, Pencil, Plus, PlugZap, Trash2 } from "lucide-react";
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
  createDeepSeekAccount,
  deleteDeepSeekAccount,
  fetchDeepSeekAccounts,
  testDeepSeek,
  updateDeepSeekAccount,
  type DeepSeekAccount,
} from "@/lib/api";

const STATUS_META: Record<string, { label: string; className: string }> = {
  normal: { label: "Normal", className: "bg-emerald-50 text-emerald-700" },
  rate_limited: { label: "Rate limited", className: "bg-amber-50 text-amber-700" },
  abnormal: { label: "Abnormal", className: "bg-rose-50 text-rose-700" },
  disabled: { label: "Disabled", className: "bg-stone-100 text-stone-500" },
};

type FormState = {
  email: string;
  password: string;
  label: string;
  proxy: string;
};

const EMPTY_FORM: FormState = {
  email: "",
  password: "",
  label: "",
  proxy: "",
};

function DeepSeekAccountsContent() {
  const [accounts, setAccounts] = useState<DeepSeekAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeepSeekAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeepSeekAccount | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const didLoadRef = useRef(false);

  const loadAccounts = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const data = await fetchDeepSeekAccounts();
      setAccounts(data.accounts);
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "Failed to load DeepSeek accounts");
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

  const openEdit = (account: DeepSeekAccount) => {
    setEditing(account);
    setForm({
      email: account.email || "",
      password: "",
      label: account.label || "",
      proxy: account.proxy || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!editing && !form.password.trim()) {
      toast.error("Password is required");
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        const updates: Record<string, string> = {
          email: form.email.trim(),
          label: form.label.trim(),
          proxy: form.proxy.trim(),
        };
        if (form.password.trim()) {
          updates.password = form.password;
        }
        await updateDeepSeekAccount(editing.id, updates);
        toast.success("Account updated");
      } else {
        await createDeepSeekAccount({
          email: form.email.trim(),
          password: form.password,
          label: form.label.trim(),
          proxy: form.proxy.trim(),
        });
        toast.success("Account added");
      }
      setDialogOpen(false);
      await loadAccounts(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      return;
    }
    try {
      await deleteDeepSeekAccount(deleteConfirm.id);
      toast.success("Account deleted");
      setDeleteConfirm(null);
      await loadAccounts(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const handleTest = async (account: DeepSeekAccount) => {
    setTestingId(account.id);
    try {
      const data = await testDeepSeek({ accountId: account.id });
      if (data.result.ok) {
        const models = Array.isArray(data.result.models) ? data.result.models : [];
        toast.success(
          `${account.email || account.label || "Account"} connected: ${models.length} model(s) available`
        );
      } else {
        toast.error(`Connection failed: ${data.result.error || "unknown error"}`);
      }
      await loadAccounts(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  };

  const usableCount = accounts.filter((account) => account.status === "normal").length;

  return (
    <section className="mx-auto w-full max-w-[1200px] px-3 pt-2 pb-10 sm:px-6 sm:pt-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-stone-950 text-white">
            <Bot className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-stone-900">DeepSeek Account Pool</h1>
            <p className="text-xs text-stone-500">
              DeepSeek accounts (email + password) for the free web API. Requests pick a healthy account with automatic
              failover.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
            {usableCount}/{accounts.length} usable
          </span>
          <Button className="h-9 rounded-full bg-stone-950 px-4 text-white hover:bg-stone-800" onClick={openAdd}>
            <Plus className="mr-1.5 size-3.5" />
            Add account
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoaderCircle className="size-5 animate-spin text-stone-400" />
        </div>
      ) : accounts.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-stone-200 bg-white/60 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Bot className="size-6 text-stone-300" />
            <p className="text-sm text-stone-600">No DeepSeek accounts yet.</p>
            <p className="max-w-sm text-xs leading-5 text-stone-400">
              Add a DeepSeek account by entering its login email and password. The account is validated on the next
              request or via the Test button.
            </p>
            <Button className="mt-1 rounded-full bg-stone-950 text-white hover:bg-stone-800" onClick={openAdd}>
              <Plus className="mr-1.5 size-3.5" />
              Add first account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => {
            const meta = STATUS_META[account.status] || STATUS_META.normal;
            const hasError = Boolean(account.last_error) && account.status !== "normal";
            return (
              <div key={account.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-stone-900">
                        {account.email || account.label || "DeepSeek account"}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.className}`}>
                        {meta.label}
                      </span>
                      {account.label ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
                          {account.label}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-stone-400">
                      {account.email || "no email"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500">
                      <span>Success {account.success || 0}</span>
                      <span>Fail {account.fail || 0}</span>
                      <span>Invalid {account.invalid_count || 0}</span>
                      <span>Models {account.models?.length || 0}</span>
                      {account.last_used_at ? <span>Used {new Date(account.last_used_at).toLocaleString("en-US")}</span> : null}
                    </div>
                    {hasError ? (
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-rose-600">{account.last_error}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="outline"
                      className="h-8 rounded-full border-stone-200 bg-white px-3 text-xs text-stone-700"
                      onClick={() => void handleTest(account)}
                      disabled={testingId === account.id}
                    >
                      {testingId === account.id ? <LoaderCircle className="size-3 animate-spin" /> : <PlugZap className="size-3" />}
                      Test
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8 rounded-full border-stone-200 bg-white px-3 text-xs text-stone-700"
                      onClick={() => openEdit(account)}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8 rounded-full border-stone-200 bg-white px-3 text-xs text-rose-600"
                      onClick={() => setDeleteConfirm(account)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl p-6 sm:max-w-lg">
          <DialogHeader className="gap-2">
            <DialogTitle>{editing ? "Edit DeepSeek account" : "Add DeepSeek account"}</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              Enter the DeepSeek web login credentials. The account must be registered at chat.deepseek.com.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-600">Email *</label>
                <Input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="user@example.com" className="h-9 rounded-xl border-stone-200 bg-white" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-600">Label (optional)</label>
                <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Main account" className="h-9 rounded-xl border-stone-200 bg-white" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-stone-600">
                Password {editing ? "(leave blank to keep current)" : "*"}
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="••••••••"
                className="h-9 rounded-xl border-stone-200 bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-stone-600">Proxy (optional)</label>
              <Input value={form.proxy} onChange={(event) => setForm({ ...form, proxy: event.target.value })} placeholder="http://host:port" className="h-9 rounded-xl border-stone-200 bg-white" />
              <p className="text-[11px] leading-4 text-stone-400">
                DeepSeek blocks logins from US IPs (WAF challenge). Use a non-US proxy if needed.
              </p>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-xl bg-stone-950 text-white hover:bg-stone-800" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {editing ? "Save changes" : "Add account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => (!open ? setDeleteConfirm(null) : null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              Delete “{deleteConfirm?.email || deleteConfirm?.label || "this account"}”? This removes its credentials and
              health history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button className="rounded-xl bg-rose-600 text-white hover:bg-rose-700" onClick={() => void handleDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default function DeepSeekAccountsPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);

  if (isCheckingAuth || !session || session.role !== "admin") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return <DeepSeekAccountsContent />;
}
