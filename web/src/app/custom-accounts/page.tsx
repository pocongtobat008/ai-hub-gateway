"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Clipboard, Globe, Key, LoaderCircle, Pencil, Plus, PlugZap, RefreshCw, RotateCcw, Server, Trash2, Zap } from "lucide-react";
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
  addCustomBulkAccounts,
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
  normal: { label: "Normal", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" },
  rate_limited: { label: "Rate limited", className: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" },
  abnormal: { label: "Abnormal", className: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400" },
  disabled: { label: "Disabled", className: "bg-stone-100 text-stone-500 dark:bg-white/5 dark:text-stone-500" },
};

// ── Group accounts by base_url ─────────────────────────────────────────────

type ProviderGroup = {
  base_url: string;
  accounts: CustomAccount[];
  label: string;
  totalModels: string[];
  normalCount: number;
  abnormalCount: number;
};

function groupByProvider(accounts: CustomAccount[]): ProviderGroup[] {
  const map = new Map<string, CustomAccount[]>();
  for (const acc of accounts) {
    const key = acc.base_url || "unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(acc);
  }
  return Array.from(map.entries())
    .map(([base_url, accs]) => {
      const allModels = [...new Set(accs.flatMap((a) => a.models || []))];
      const normalCount = accs.filter((a) => a.status === "normal").length;
      const label = accs[0]?.label?.replace(/ #\d+$/, "") || base_url.split("/").pop() || "Custom";
      return { base_url, accounts: accs, label, totalModels: allModels, normalCount, abnormalCount: accs.length - normalCount };
    })
    .sort((a, b) => b.accounts.length - a.accounts.length);
}

// ── Provider Card ──────────────────────────────────────────────────────────

function ProviderCard({
  group,
  onTest,
  onRefresh,
  onEditProvider,
  onDelete,
  testingId,
  refreshingId,
}: {
  group: ProviderGroup;
  onTest: (acc: CustomAccount) => void;
  onRefresh: (acc: CustomAccount) => void;
  onEditProvider: (group: ProviderGroup) => void;
  onDelete: (acc: CustomAccount) => void;
  testingId: string | null;
  refreshingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const allNormal = group.normalCount === group.accounts.length;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-stone-700 to-stone-900 text-white shadow-md dark:from-stone-300 dark:to-stone-500 dark:text-stone-950">
            <Server className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-stone-900 dark:text-stone-100">{group.label}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${allNormal ? STATUS_META.normal.className : STATUS_META.abnormal.className}`}>
                {group.normalCount}/{group.accounts.length} OK
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-stone-500 dark:text-stone-400 truncate">{group.base_url}</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {group.totalModels.slice(0, 6).map((m) => (
                <span key={m} className="inline-flex items-center rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-white/10 dark:text-stone-400">{m}</span>
              ))}
              {group.totalModels.length > 6 && <span className="text-[10px] text-stone-400">+{group.totalModels.length - 6} more</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => onEditProvider(group)} title="Edit provider / add keys">
              <Pencil className="size-3.5" />
            </Button>
            <button type="button" onClick={() => setExpanded(!expanded)} className="inline-flex size-7 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-white/10">
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          </div>
        </div>

        {/* Expanded keys */}
        {expanded && (
          <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-3 dark:border-white/5">
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">API Keys ({group.accounts.length})</p>
            {group.accounts.map((acc) => {
              const meta = STATUS_META[acc.status] || STATUS_META.normal;
              return (
                <div key={acc.id} className="flex items-center gap-2 rounded-lg border border-stone-100 bg-stone-50/50 px-3 py-2 transition hover:bg-stone-100/80 dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/5">
                  <Key className="size-3 shrink-0 text-stone-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-stone-700 dark:text-stone-300">{acc.api_key_masked}</span>
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${meta.className}`}>{meta.label}</span>
                    </div>
                    {acc.last_error && <div className="text-[10px] text-rose-500 truncate">{acc.last_error}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="size-6" onClick={() => onTest(acc)} disabled={testingId === acc.id}>
                      {testingId === acc.id ? <LoaderCircle className="size-3 animate-spin" /> : <PlugZap className="size-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="size-6" onClick={() => onRefresh(acc)} disabled={refreshingId === acc.id}>
                      {refreshingId === acc.id ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="size-6 text-rose-500 hover:text-rose-600" onClick={() => onDelete(acc)}><Trash2 className="size-3" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

function CustomAccountsContent() {
  const [accounts, setAccounts] = useState<CustomAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit-provider">("add");
  const [editingGroup, setEditingGroup] = useState<ProviderGroup | null>(null);

  const [form, setForm] = useState({
    baseUrl: "", apiKey: "", label: "", modelsText: "",
    bulkMode: false, bulkKeys: "",
    addKeyMode: false, newSingleKey: "", newBulkMode: false, newBulkKeys: "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CustomAccount | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await fetchCustomAccounts();
      setAccounts(data.accounts || []);
    } catch { toast.error("Failed to load accounts"); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const groups = useMemo(() => groupByProvider(accounts), [accounts]);

  // ── Open dialogs ───────────────────────────────────────────────────────

  const openAdd = () => {
    setDialogMode("add");
    setEditingGroup(null);
    setForm({ baseUrl: "", apiKey: "", label: "", modelsText: "", bulkMode: false, bulkKeys: "", addKeyMode: false, newSingleKey: "", newBulkMode: false, newBulkKeys: "" });
    setDialogOpen(true);
  };

  const openEditProvider = (group: ProviderGroup) => {
    setDialogMode("edit-provider");
    setEditingGroup(group);
    setForm({
      baseUrl: group.base_url,
      apiKey: "",
      label: group.label,
      modelsText: group.totalModels.join("\n"),
      bulkMode: false,
      bulkKeys: "",
      addKeyMode: false,
      newSingleKey: "",
      newBulkMode: false,
      newBulkKeys: "",
    });
    setDialogOpen(true);
  };

  // ── Fetch models ─────────────────────────────────────────────────────

  const handleFetchModels = async () => {
    if (!form.baseUrl.trim()) { toast.error("Enter a base URL first"); return; }
    setIsFetching(true);
    try {
      const data = await validateCustomModels({ base_url: form.baseUrl.trim(), api_key: form.apiKey.trim() });
      if (data.ok && data.models.length > 0) {
        const existing = form.modelsText.split("\n").map((m) => m.trim()).filter(Boolean);
        setForm({ ...form, modelsText: [...new Set([...existing, ...data.models])].join("\n") });
        toast.success(`Found ${data.models.length} models`);
      } else { toast.error("No models found"); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setIsFetching(false); }
  };

  // ── Save (add new provider or add keys to existing) ──────────────────

  const handleSave = async () => {
    if (!form.baseUrl.trim()) { toast.error("Base URL is required"); return; }
    const models = form.modelsText.split("\n").map((m) => m.trim()).filter(Boolean);
    if (models.length === 0) { toast.error("Add at least one model"); return; }
    setIsSaving(true);
    try {
      if (dialogMode === "edit-provider" && editingGroup) {
        // ── Edit provider: add new keys ──
        const newKeys: string[] = [];
        if (form.addKeyMode) {
          if (form.newBulkMode && form.newBulkKeys.trim()) {
            newKeys.push(...form.newBulkKeys.split("\n").map((k) => k.trim()).filter(Boolean));
          } else if (form.newSingleKey.trim()) {
            newKeys.push(form.newSingleKey.trim());
          }
        }
        if (newKeys.length > 0) {
          const result = await addCustomBulkAccounts({
            base_url: form.baseUrl.trim(),
            api_keys: newKeys,
            models,
            label: form.label.trim() || editingGroup.label,
          });
          toast.success(`Added ${result.added} new key(s)`);
        } else {
          toast.info("No new keys to add");
        }
      } else {
        // ── Add new provider ──
        if (form.bulkMode && form.bulkKeys.trim()) {
          const keys = form.bulkKeys.split("\n").map((k) => k.trim()).filter(Boolean);
          if (keys.length === 0) { toast.error("No valid API keys"); return; }
          const result = await addCustomBulkAccounts({ base_url: form.baseUrl.trim(), api_keys: keys, models, label: form.label.trim() || "" });
          toast.success(`${result.added} account(s) added`);
        } else {
          await createCustomAccount({ base_url: form.baseUrl.trim(), api_key: form.apiKey.trim(), models, label: form.label.trim() || "" });
          toast.success("Account added");
        }
      }
      setDialogOpen(false);
      await loadAccounts();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save"); }
    finally { setIsSaving(false); }
  };

  // ── Test / Refresh / Delete ──────────────────────────────────────────

  const handleTest = async (account: CustomAccount) => {
    setTestingId(account.id);
    try {
      const result = await testCustom({ account_id: account.id });
      if (result.ok) toast.success(`${account.label || "Key"}: OK`);
      else toast.error(`${account.label || "Key"}: ${result.error || "Failed"}`);
      await loadAccounts();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Test failed"); }
    finally { setTestingId(null); }
  };

  const handleRefreshOne = async (account: CustomAccount) => {
    setRefreshingId(account.id);
    try {
      await validateCustomModels({ base_url: account.base_url, api_key: "" });
      toast.success("Refreshed");
      await loadAccounts();
    } catch { toast.error("Refresh failed"); }
    finally { setRefreshingId(null); }
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    try {
      const result = await testAllCustom();
      toast.success(`Tested: ${result.passed}/${result.total} passed`);
      await loadAccounts();
    } catch { toast.error("Test all failed"); }
    finally { setTestingAll(false); }
  };

  const handleDelete = async (account: CustomAccount) => {
    try {
      await deleteCustomAccount(account.id);
      toast.success("Deleted");
      setDeleteConfirm(null);
      await loadAccounts();
    } catch { toast.error("Delete failed"); }
  };

  const handleReset = async () => {
    if (!confirm("Reset all custom account statuses?")) return;
    try {
      const result = await resetCustomAccounts();
      toast.success(`Reset ${result.reset} accounts`);
      await loadAccounts();
    } catch { toast.error("Reset failed"); }
  };

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Custom Providers</h1>
          <p className="text-xs text-stone-500">{accounts.length} accounts across {groups.length} provider(s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1"><RotateCcw className="size-3.5" /> Reset</Button>
          <Button variant="outline" size="sm" onClick={() => void handleTestAll()} disabled={testingAll} className="gap-1">
            {testingAll ? <LoaderCircle className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />} Test All
          </Button>
          <Button size="sm" onClick={openAdd} className="gap-1.5"><Plus className="size-4" /> Add Provider</Button>
        </div>
      </div>

      {/* Provider Cards */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Globe className="mx-auto mb-3 size-8 text-stone-300" />
            <p className="text-sm font-medium text-stone-600">No custom providers configured</p>
            <p className="mt-1 text-xs text-stone-400">Add an OpenAI-compatible endpoint to get started</p>
            <Button onClick={openAdd} size="sm" className="mt-4 gap-1.5"><Plus className="size-4" /> Add Provider</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <ProviderCard
              key={group.base_url}
              group={group}
              onTest={handleTest}
              onRefresh={handleRefreshOne}
              onEditProvider={openEditProvider}
              onDelete={(acc) => setDeleteConfirm(acc)}
              testingId={testingId}
              refreshingId={refreshingId}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Provider Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "edit-provider" ? `Edit ${editingGroup?.label || "Provider"}` : "Add Custom Provider"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "edit-provider"
                ? "Add new API keys or update models for this provider."
                : "Connect any OpenAI-compatible API endpoint."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Base URL — readonly in edit mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Base URL *</label>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="font-mono text-xs"
                readOnly={dialogMode === "edit-provider"}
              />
            </div>

            {/* ── Add mode: API Key input ── */}
            {dialogMode === "add" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-300">API Key</label>
                  <button type="button" onClick={() => setForm({ ...form, bulkMode: !form.bulkMode, apiKey: "", bulkKeys: "" })} className="text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                    {form.bulkMode ? "Single key" : "Bulk add"}
                  </button>
                </div>
                {form.bulkMode ? (
                  <div className="space-y-1.5">
                    <textarea value={form.bulkKeys} onChange={(e) => setForm({ ...form, bulkKeys: e.target.value })} placeholder={"Paste API keys, one per line:\nsk-key1...\nsk-key2..."} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-white/5 min-h-[80px]" rows={4} />
                    <p className="text-[11px] text-stone-400">{form.bulkKeys.split("\n").filter((k) => k.trim()).length} key(s)</p>
                  </div>
                ) : (
                  <Input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-... (leave empty if not needed)" className="font-mono text-xs" type="password" />
                )}
              </div>
            )}

            {/* ── Edit mode: Add new keys ── */}
            {dialogMode === "edit-provider" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                    {form.addKeyMode ? "New API Keys" : "Add API Keys"}
                  </label>
                  {!form.addKeyMode ? (
                    <button type="button" onClick={() => setForm({ ...form, addKeyMode: true })} className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                      <Plus className="size-3" /> Add key
                    </button>
                  ) : (
                    <button type="button" onClick={() => setForm({ ...form, addKeyMode: false, newSingleKey: "", newBulkKeys: "" })} className="text-[11px] font-medium text-stone-400 hover:text-stone-600">
                      Cancel
                    </button>
                  )}
                </div>
                {form.addKeyMode && (
                  <>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setForm({ ...form, newBulkMode: false })} className={`text-[11px] font-medium px-2 py-1 rounded ${!form.newBulkMode ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 hover:bg-stone-100"}`}>
                        Single
                      </button>
                      <button type="button" onClick={() => setForm({ ...form, newBulkMode: true })} className={`text-[11px] font-medium px-2 py-1 rounded ${form.newBulkMode ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 hover:bg-stone-100"}`}>
                        Bulk
                      </button>
                    </div>
                    {form.newBulkMode ? (
                      <div className="space-y-1.5">
                        <textarea value={form.newBulkKeys} onChange={(e) => setForm({ ...form, newBulkKeys: e.target.value })} placeholder={"Paste new API keys, one per line:\nsk-key1...\nsk-key2..."} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-white/5 min-h-[80px]" rows={4} />
                        <p className="text-[11px] text-stone-400">{form.newBulkKeys.split("\n").filter((k) => k.trim()).length} new key(s) to add</p>
                      </div>
                    ) : (
                      <Input value={form.newSingleKey} onChange={(e) => setForm({ ...form, newSingleKey: e.target.value })} placeholder="Paste new API key" className="font-mono text-xs" type="password" />
                    )}
                  </>
                )}
              </div>
            )}

            {/* Fetch Models */}
            <Button variant="outline" size="sm" onClick={() => void handleFetchModels()} disabled={isFetching || !form.baseUrl.trim()} className="gap-1.5">
              {isFetching ? <LoaderCircle className="size-4 animate-spin" /> : <Zap className="size-4" />} Fetch Models
            </Button>

            {/* Models */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Models <span className="text-stone-400 font-normal">(one per line)</span></label>
              <textarea value={form.modelsText} onChange={(e) => setForm({ ...form, modelsText: e.target.value })} placeholder={"gpt-4o\nclaude-3-opus"} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-white/5 min-h-[100px]" rows={5} />
            </div>

            {/* Label */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Label</label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="My API Provider" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !form.baseUrl.trim()}>
              {isSaving ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : null}
              {dialogMode === "edit-provider" ? "Add Keys" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>Delete this API key? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDelete(deleteConfirm!)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CustomAccountsPage() {
  const { isCheckingAuth } = useAuthGuard();
  if (isCheckingAuth) return <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  return <CustomAccountsContent />;
}
