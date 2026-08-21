"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  Key,
  LoaderCircle,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Clock,
  Users,
  Zap,
} from "lucide-react";
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
import { httpRequest } from "@/lib/request";

type AuthCode = {
  id: string;
  role: string;
  name: string;
  max_uses: number;
  use_count: number;
  expires_at: string | null;
  enabled: boolean;
  created_at: string;
  last_used_at: string | null;
  last_used_by: string | null;
  is_expired: boolean;
  is_depleted: boolean;
};

type GeneratedCode = AuthCode & { code: string };

type CodeStats = {
  total: number;
  active: number;
  expired: number;
  depleted: number;
  total_uses: number;
};

export function AuthCodesCard() {
  const [codes, setCodes] = useState<AuthCode[]>([]);
  const [stats, setStats] = useState<CodeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null);
  const [showGenerated, setShowGenerated] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: "user",
    maxUses: 0,
    expiresHours: 0,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<AuthCode | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [codesRes, statsRes] = await Promise.all([
        httpRequest<{ codes: AuthCode[]; total: number }>("/api/auth-codes/list"),
        httpRequest<CodeStats>("/api/auth-codes/stats"),
      ]);
      setCodes(codesRes.codes || []);
      setStats(statsRes);
    } catch {
      toast.error("Failed to load auth codes");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await httpRequest<GeneratedCode>("/api/auth-codes/generate", {
        method: "POST",
        body: JSON.stringify({
          role: form.role,
          name: form.name,
          max_uses: form.maxUses,
          expires_in_hours: form.expiresHours,
        }),
      });
      setGeneratedCode(result);
      setShowGenerated(true);
      setShowGenerate(false);
      setForm({ name: "", role: "user", maxUses: 0, expiresHours: 0 });
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate code");
    }
    setIsGenerating(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await httpRequest(`/api/auth-codes/${deleteConfirm.id}`, { method: "DELETE" });
      toast.success("Code deleted");
      setDeleteConfirm(null);
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await httpRequest(`/api/auth-codes/${id}/toggle`, { method: "POST" });
      load();
    } catch {
      toast.error("Failed to toggle");
    }
  };

  const handleReset = async (id: string) => {
    try {
      await httpRequest(`/api/auth-codes/${id}/reset`, { method: "POST" });
      toast.success("Usage reset");
      load();
    } catch {
      toast.error("Failed to reset");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied!");
  };

  const formatDate = (s: string | null) => {
    if (!s) return "—";
    try {
      return new Date(s).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return s;
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-indigo-600" />
            <h3 className="text-base font-semibold">Auth Codes</h3>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setShowGenerate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Generate Code
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Generate shareable auth codes for users to log in. Like ChatGPT or Gemini access codes.
        </p>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg bg-stone-50 p-2 text-center dark:bg-stone-800/50">
              <div className="text-lg font-bold">{stats.total}</div>
              <div className="text-[10px] text-muted-foreground">Total</div>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2 text-center dark:bg-emerald-900/20">
              <div className="text-lg font-bold text-emerald-600">{stats.active}</div>
              <div className="text-[10px] text-muted-foreground">Active</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-2 text-center dark:bg-amber-900/20">
              <div className="text-lg font-bold text-amber-600">{stats.expired}</div>
              <div className="text-[10px] text-muted-foreground">Expired</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-2 text-center dark:bg-blue-900/20">
              <div className="text-lg font-bold text-blue-600">{stats.total_uses}</div>
              <div className="text-[10px] text-muted-foreground">Total Uses</div>
            </div>
          </div>
        )}

        {/* Codes List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : codes.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No auth codes yet. Generate one to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {codes.map((code) => {
              const isUsable = code.enabled && !code.is_expired && !code.is_depleted;
              return (
                <div
                  key={code.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                    isUsable
                      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/10"
                      : "border-stone-200 bg-stone-50/50 opacity-60 dark:border-stone-700 dark:bg-stone-800/30"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{code.name}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          code.role === "admin"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}
                      >
                        {code.role === "admin" ? (
                          <ShieldCheck className="h-3 w-3" />
                        ) : (
                          <Users className="h-3 w-3" />
                        )}
                        {code.role}
                      </span>
                      {code.is_expired && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/30">
                          Expired
                        </span>
                      )}
                      {code.is_depleted && (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-600 dark:bg-orange-900/30">
                          Depleted
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>
                        Uses: {code.use_count}
                        {code.max_uses > 0 ? `/${code.max_uses}` : " (∞)"}
                      </span>
                      {code.expires_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(code.expires_at)}
                        </span>
                      )}
                      <span>Created: {formatDate(code.created_at)}</span>
                    </div>
                    {code.last_used_at && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        Last used: {formatDate(code.last_used_at)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleToggle(code.id)}
                      title={code.enabled ? "Disable" : "Enable"}
                    >
                      {code.enabled ? (
                        <ToggleRight className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-stone-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleReset(code.id)}
                      title="Reset usage"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-rose-500"
                      onClick={() => setDeleteConfirm(code)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Generate Dialog */}
        <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-indigo-600" />
                Generate Auth Code
              </DialogTitle>
              <DialogDescription>
                Create a shareable code for users to log in to BecomeAI.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">Code Name</label>
                <Input
                  placeholder="e.g., Team Member, Client Access"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <div className="flex gap-2 mt-1">
                  <Button
                    variant={form.role === "user" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm({ ...form, role: "user" })}
                    className="flex-1"
                  >
                    <Users className="h-4 w-4 mr-1" />
                    User
                  </Button>
                  <Button
                    variant={form.role === "admin" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm({ ...form, role: "admin" })}
                    className="flex-1"
                  >
                    <ShieldCheck className="h-4 w-4 mr-1" />
                    Admin
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Max Uses</label>
                  <Input
                    type="number"
                    placeholder="0 = unlimited"
                    value={form.maxUses || ""}
                    onChange={(e) => setForm({ ...form, maxUses: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Expires (hours)</label>
                  <Input
                    type="number"
                    placeholder="0 = never"
                    value={form.expiresHours || ""}
                    onChange={(e) => setForm({ ...form, expiresHours: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerate(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? <LoaderCircle className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
                Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Generated Code Display */}
        <Dialog open={showGenerated} onOpenChange={setShowGenerated}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600">
                <Zap className="h-5 w-5" />
                Code Generated!
              </DialogTitle>
              <DialogDescription>
                Share this code with the user. It will only be shown once.
              </DialogDescription>
            </DialogHeader>
            {generatedCode && (
              <div className="space-y-4 py-2">
                <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-4 text-center dark:border-indigo-700 dark:bg-indigo-900/20">
                  <div className="text-xs text-muted-foreground mb-2">Auth Code</div>
                  <div className="text-2xl font-mono font-bold tracking-wider text-indigo-700 dark:text-indigo-400 select-all">
                    {generatedCode.code}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Role:</span>
                  <span className="font-medium capitalize">{generatedCode.role}</span>
                </div>
                {generatedCode.max_uses > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Max Uses:</span>
                    <span className="font-medium">{generatedCode.max_uses}</span>
                  </div>
                )}
                {generatedCode.expires_at && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Expires:</span>
                    <span className="font-medium">{formatDate(generatedCode.expires_at)}</span>
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={() => copyCode(generatedCode.code)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Code
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Auth Code</DialogTitle>
              <DialogDescription>
                Delete &quot;{deleteConfirm?.name}&quot;? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
