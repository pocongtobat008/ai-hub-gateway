"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createLocalBackup,
  deleteLocalBackup,
  fetchLocalBackups,
  restoreLocalBackup,
  type LocalBackup,
} from "@/lib/api";

export function BackupCard() {
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchLocalBackups();
      setBackups(data.backups || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const result = await createLocalBackup();
      if (result.ok) {
        toast.success(
          `Backup created: ${result.filename} (${result.compression_ratio} compressed)`,
        );
        await loadBackups();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async (filename: string) => {
    setRestoringId(filename);
    try {
      const result = await restoreLocalBackup(filename);
      if (result.ok) {
        toast.success(`Restored ${result.restored_files} files from ${filename}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (filename: string) => {
    setDeletingId(filename);
    try {
      await deleteLocalBackup(filename);
      toast.success("Backup deleted");
      await loadBackups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = (filename: string) => {
    const token = localStorage.getItem("auth_token");
    const url = `/api/local-backup/download/${encodeURIComponent(filename)}`;
    // Open in new tab with auth header via fetch
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        toast.success("Downloaded");
      })
      .catch(() => toast.error("Download failed"));
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="size-4" />
          Local Backup
        </CardTitle>
        <CardDescription>
          Automatic backup every 6 hours. Stored locally with compression.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => void handleCreate()}
            disabled={isCreating}
            className="gap-1.5"
          >
            {isCreating ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            Backup Now
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadBackups()}
            className="gap-1.5"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>

        {/* Backup list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <LoaderCircle className="size-4 animate-spin text-stone-400" />
          </div>
        ) : backups.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">
            No backups yet. Click &quot;Backup Now&quot; to create one.
          </p>
        ) : (
          <div className="space-y-2">
            {backups.map((backup) => (
              <div
                key={backup.filename}
                className="flex items-center gap-3 rounded-xl border border-stone-100 bg-white/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-stone-700 dark:text-stone-200">
                    {backup.filename}
                  </p>
                  <p className="text-[11px] text-stone-400">
                    {backup.size_human} · {backup.created_at}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-7 p-0"
                    onClick={() => handleDownload(backup.filename)}
                    title="Download"
                  >
                    <Download className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-7 p-0"
                    onClick={() => void handleRestore(backup.filename)}
                    disabled={restoringId === backup.filename}
                    title="Restore"
                  >
                    {restoringId === backup.filename ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-7 p-0 text-rose-500 hover:text-rose-600"
                    onClick={() => void handleDelete(backup.filename)}
                    disabled={deletingId === backup.filename}
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
