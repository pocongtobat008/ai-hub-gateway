"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clipboard, LoaderCircle, Pencil, Plus, PlugZap, Trash2, Zap } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
  authMethod: "api_key" | "cookies";
  apiKey: string;
  cookieText: string;
  label: string;
  proxy: string;
};

const EMPTY_FORM: FormState = {
  authMethod: "api_key",
  apiKey: "",
  cookieText: "",
  label: "",
  proxy: "",
};

function parseCookies(text: string): Record<string, string> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); } catch { /* not JSON */ }
  }
  const cookies: Record<string, string> = {};
  for (const part of trimmed.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key && rest.length > 0) {
      cookies[key.trim()] = rest.join("=").trim();
    }
  }
  return cookies;
}

function GrokAccountsContent() {
  const [accounts, setAccounts] = useState<GrokAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GrokAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<GrokAccount | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const didLoadRef = useRef(false);

  const loadAccounts = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchGrokAccounts();
      setAccounts(data.accounts);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Failed to load Grok accounts");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void loadAccounts();
  }, [loadAccounts]);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };

  const openEdit = (account: GrokAccount) => {
    setEditing(account);
    setForm({
      authMethod: account.api_key_masked ? "api_key" : "cookies",
      apiKey: "",
      cookieText: "",
      label: account.label || "",
      proxy: account.proxy || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (form.authMethod === "api_key") {
        const key = form.api_key || form.apiKey;
        if (!editing && !key.trim()) {
          toast.error("API key is required"); setIsSaving(false); return;
        }
        if (editing) {
          const updates: Record<string, unknown> = {};
          if (key.trim()) updates.api_key = key.trim();
          if (form.label !== undefined) updates.label = form.label.trim();
          if (form.proxy !== undefined) updates.proxy = form.proxy.trim();
          const data = await updateGrokAccount(editing.id, updates);
          setAccounts(data.accounts);
          toast.success("Account updated");
        } else {
          const data = await createGrokAccount({ api_key: key.trim(), label: form.label.trim(), proxy: form.proxy.trim() });
          setAccounts(data.accounts);
          toast.success("Account added");
        }
      } else {
        const cookies = parseCookies(form.cookieText);
        if (!editing && !cookies["sso"]) {
          toast.error("sso cookie is required"); setIsSaving(false); return;
        }
        if (editing) {
          const updates: Record<string, unknown> = {};
          if (cookies["sso"]) updates.cookies = cookies;
          if (form.label !== undefined) updates.label = form.label.trim();
          if (form.proxy !== undefined) updates.proxy = form.proxy.trim();
          const data = await updateGrokAccount(editing.id, updates);
          setAccounts(data.accounts);
          toast.success("Account updated");
        } else {
          const data = await createGrokAccount({ cookies, label: form.label.trim(), proxy: form.proxy.trim() });
          setAccounts(data.accounts);
          toast.success("Account added");
        }
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
      const data = await testGrok({ account_id: account.id });
      if (data.result.ok) {
        toast.success(`Account works! ${data.result.models ? `Models: ${data.result.models.join(", ")}` : data.result.name || "OK"}`);
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
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Grok Accounts</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Manage Grok accounts for round-robin rotation. Supports xAI API key (recommended) or browser cookies.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHelp(!showHelp)}>
            <Clipboard className="mr-1 size-4" />
            Setup Guide
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
            <div className="font-semibold text-blue-800 dark:text-blue-300">🔑 Method 1: xAI API Key (Recommended)</div>
            <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-400">
              <li>Go to <a href="https://console.x.ai" target="_blank" className="underline font-medium">console.x.ai</a></li>
              <li>Sign up / login with your X (Twitter) account</li>
              <li>Go to <strong>API Keys</strong> → <strong>Create API Key</strong></li>
              <li>Copy the key (starts with <code className="bg-white/50 px-1 rounded">xai-</code>)</li>
              <li>Paste it in the form below</li>
            </ol>
            <div className="text-xs text-blue-600 dark:text-blue-500">
              Free tier: 25 requests/day. No credit card needed.
            </div>
            <div className="font-semibold text-blue-800 dark:text-blue-300 pt-2">🍪 Method 2: Browser Cookies (Fallback)</div>
            <div className="text-xs text-blue-600 dark:text-blue-500">
              Requires <code>cf_clearance</code> cookie from Cloudflare challenge. Less reliable.
            </div>
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
          <div className="text-2xl font-bold text-amber-600">{accounts.filter((a) => a.status === "rate_limited").length}</div>
          <div className="text-xs text-stone-500">Rate Limited</div>
        </CardContent></Card>
      </div>

      {/* Account list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>
      ) : accounts.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Zap className="mb-3 size-8 text-stone-300 dark:text-stone-600" />
          <div className="text-sm font-medium text-stone-600 dark:text-stone-400">No Grok accounts configured</div>
          <div className="mt-1 text-xs text-stone-400">Add an xAI API key or browser cookies to get started</div>
          <Button onClick={openAdd} size="sm" className="mt-4 gap-1.5"><Plus className="size-4" /> Add Account</Button>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((account) => {
            const meta = STATUS_META[account.status] || STATUS_META.normal;
            const hasApiKey = !!account.api_key_masked;
            return (
              <Card key={account.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{account.label || "Grok Account"}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>{meta.label}</span>
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                          {hasApiKey ? "API Key" : "Cookie"}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-stone-500 dark:text-stone-400">
                        {hasApiKey ? account.api_key_masked : `${account.cookie_count || 0} cookies`}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-stone-400">
                        <span>✓ {account.success || 0}</span>
                        <span>✗ {account.fail || 0}</span>
                        {account.last_error && <span className="truncate text-rose-500">{account.last_error}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => void handleTest(account)} disabled={testingId === account.id} title="Test">
                        {testingId === account.id ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(account)} title="Edit"><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="size-8 text-rose-500 hover:text-rose-600" onClick={() => setDeleteConfirm(account)} title="Delete"><Trash2 className="size-4" /></Button>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Account" : "Add Grok Account"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the account settings." : "Choose an authentication method below."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Auth method tabs */}
            <div className="flex gap-2 rounded-lg bg-stone-100 p-1 dark:bg-stone-800">
              <button
                type="button"
                onClick={() => setForm({ ...form, authMethod: "api_key" })}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${form.authMethod === "api_key" ? "bg-white shadow-sm text-stone-900 dark:bg-stone-700 dark:text-stone-100" : "text-stone-500 hover:text-stone-700"}`}
              >
                🔑 API Key (Recommended)
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, authMethod: "cookies" })}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${form.authMethod === "cookies" ? "bg-white shadow-sm text-stone-900 dark:bg-stone-700 dark:text-stone-100" : "text-stone-500 hover:text-stone-700"}`}
              >
                🍪 Cookies
              </button>
            </div>

            {form.authMethod === "api_key" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300">xAI API Key *</label>
                <Input
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="xai-..."
                  className="font-mono text-xs"
                  disabled={!!editing}
                />
                {editing && <p className="text-[11px] text-stone-400">Leave empty to keep current key.</p>}
                <p className="text-[11px] text-stone-400">
                  Get your key at <a href="https://console.x.ai" target="_blank" className="underline">console.x.ai</a> → API Keys
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Browser Cookies *</label>
                <Textarea
                  value={form.cookieText}
                  onChange={(e) => setForm({ ...form, cookieText: e.target.value })}
                  placeholder={'sso=xxx; sso-rw=yyy; x-userid=zzz'}
                  className="font-mono text-xs min-h-[80px]"
                  disabled={!!editing}
                />
                {editing && <p className="text-[11px] text-stone-400">Leave empty to keep current cookies.</p>}
                <p className="text-[11px] text-stone-400">
                  Required: <code>sso</code>. Needs <code>cf_clearance</code> for POST requests.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Label</label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Main account" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Proxy (optional)</label>
              <Input value={form.proxy} onChange={(e) => setForm({ ...form, proxy: e.target.value })} placeholder="http://user:pass@host:port" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : null}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>Are you sure you want to delete this Grok account?</DialogDescription>
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

export default function GrokAccountsPage() {
  const { isCheckingAuth } = useAuthGuard(["admin"]);
  if (isCheckingAuth) {
    return <div className="flex min-h-[50vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }
  return <GrokAccountsContent />;
}
