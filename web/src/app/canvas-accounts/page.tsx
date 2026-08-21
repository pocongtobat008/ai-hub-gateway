"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  LoaderCircle,
  Paintbrush,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@//components/ui/card";
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
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

type CanvasAccount = {
  id: string;
  base_url: string;
  token: string;
  label: string;
  models: string[];
  status: string;
  total_requests: number;
  error_count: number;
  last_used: string | null;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  normal: {
    label: "Active",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  limited: {
    label: "Limited",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  error: {
    label: "Error",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  },
};

function apiBase(): string {
  try {
    return (window as any).__BECOMEAI_API_URL__ || window.location.origin;
  } catch {
    return window.location.origin;
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const url = `${apiBase()}${path}`;
  const authKey =
    typeof window !== "undefined"
      ? await import("@/store/auth").then((m) => m.getStoredAuthKey())
      : "";
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authKey || ""}`,
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export default function CanvasAccountsPage() {
  const { isCheckingAuth, session } = useAuthGuard();
  const [accounts, setAccounts] = useState<CanvasAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [form, setForm] = useState({ base_url: "http://127.0.0.1:8765", token: "", label: "" });

  const loadAccounts = useCallback(async () => {
    try {
      const data = await apiFetch("/api/canvas/accounts");
      setAccounts(data.accounts || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) loadAccounts();
  }, [session, loadAccounts]);

  const handleAdd = async () => {
    if (!form.base_url.trim()) return toast.error("Base URL is required");
    if (!form.token.trim()) return toast.error("Token is required");
    try {
      const data = await apiFetch("/api/canvas/accounts", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setAccounts((prev) => [...prev, data.account]);
      setShowAdd(false);
      setForm({ base_url: "http://127.0.0.1:8765", token: "", label: "" });
      toast.success("Account added");
    } catch (e: any) {
      toast.error(e.message || "Failed to add account");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/canvas/accounts/${id}`, { method: "DELETE" });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Account deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const data = await apiFetch(`/api/canvas/accounts/${id}/test`);
      if (data.ok) {
        toast.success("Proxy is healthy ✓");
      } else {
        toast.error(`Test failed: ${data.error || data.status}`);
      }
    } catch (e: any) {
      toast.error(e.message || "Test failed");
    } finally {
      setTesting(null);
    }
  };

  const handleResetAll = async () => {
    try {
      await apiFetch("/api/canvas/accounts/reset-all", { method: "POST" });
      await loadAccounts();
      toast.success("All accounts reset");
    } catch (e: any) {
      toast.error(e.message || "Failed to reset");
    }
  };

  const totalPages = Math.ceil(accounts.length / PAGE_SIZE);
  const paged = accounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isCheckingAuth || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
              Gemini Canvas Proxy
            </h1>
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              {accounts.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Free unlimited Gemini API via Canvas MessageChannel bridge
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetAll}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            Reset All
          </Button>
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            className="gap-1.5 bg-stone-900 text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900"
          >
            <Plus className="size-3.5" />
            Add Proxy
          </Button>
        </div>
      </div>

      {/* How it works */}
      <Card className="mb-6 border-violet-200 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-950/20">
        <CardContent className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-violet-800 dark:text-violet-300">
            How Gemini Canvas Proxy Works
          </h3>
          <ol className="space-y-1 text-xs text-violet-700 dark:text-violet-400">
            <li>1. Install the Chrome extension from{" "}
              <a href="https://github.com/pranrichh/gemini-canvas-proxy" target="_blank" className="underline">
                gemini-canvas-proxy
              </a>
            </li>
            <li>2. Open <strong>gemini.google.com</strong> → Canvas → "Create an HTML web app"</li>
            <li>3. Paste <code className="rounded bg-violet-100 px-1 dark:bg-violet-900/50">canvas-proxy.html</code> into Code view → Click Preview</li>
            <li>4. The proxy runs at <code className="rounded bg-violet-100 px-1 dark:bg-violet-900/50">http://127.0.0.1:8765</code> with unlimited free Gemini API</li>
            <li>5. Add the proxy endpoint + token here → models appear in chat!</li>
          </ol>
        </CardContent>
      </Card>

      {/* Account list */}
      {paged.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 py-12 text-center dark:border-stone-700">
          <Paintbrush className="mx-auto mb-3 size-8 text-stone-300 dark:text-stone-600" />
          <p className="text-sm text-stone-500">No Canvas proxy accounts yet</p>
          <p className="mt-1 text-xs text-stone-400">
            Add a proxy endpoint to start using free unlimited Gemini
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {paged.map((account) => {
            const meta = STATUS_META[account.status] || STATUS_META.normal;
            return (
              <Card
                key={account.id}
                className="transition hover:shadow-md dark:hover:shadow-black/20"
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 text-white">
                    <Zap className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                        {account.label || "Canvas Proxy"}
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", meta.className)}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
                      <span className="flex items-center gap-1">
                        <Globe className="size-3" />
                        {account.base_url}
                      </span>
                      <span>{account.models.length} models</span>
                      <span>{account.total_requests} requests</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {account.models.slice(0, 4).map((m) => (
                        <span
                          key={m}
                          className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-white/10 dark:text-stone-400"
                        >
                          {m}
                        </span>
                      ))}
                      {account.models.length > 4 && (
                        <span className="text-[10px] text-stone-400">
                          +{account.models.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(account.id)}
                      disabled={testing === account.id}
                      className="h-8 gap-1 text-xs"
                    >
                      {testing === account.id ? (
                        <LoaderCircle className="size-3 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3" />
                      )}
                      Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(account.id)}
                      className="h-8 gap-1 text-xs text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-stone-500">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Canvas Proxy</DialogTitle>
            <DialogDescription>
              Connect to a running Gemini Canvas Proxy instance
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                Proxy URL *
              </label>
              <Input
                value={form.base_url}
                onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                placeholder="http://127.0.0.1:8765"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                Bearer Token *
              </label>
              <Input
                value={form.token}
                onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                placeholder="From native_host/.proxy_token"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                Label (optional)
              </label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="My Canvas Proxy"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              className="bg-stone-900 text-white hover:bg-stone-800"
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
