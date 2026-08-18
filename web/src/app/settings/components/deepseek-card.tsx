"use client";

import { useEffect, useState } from "react";
import { Bot, ExternalLink, LoaderCircle, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchDeepSeekStatus, type DeepSeekStatus } from "@/lib/api";

export function DeepSeekCard() {
  const [status, setStatus] = useState<DeepSeekStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const data = await fetchDeepSeekStatus();
      setStatus(data.result);
    } catch {
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const accountCount = status?.total ?? 0;
  const usableCount = status?.usable ?? 0;
  const statusBadge = status
    ? status.ready
      ? "Connected"
      : status.configured
        ? "Not connected"
        : "Not configured"
    : "Unknown";

  return (
    <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-stone-900">
              <Bot className="size-5 text-stone-500" />
              DeepSeek (free web account pool)
            </div>
            <p className="mt-1 text-xs leading-6 text-stone-500">
              DeepSeek runs on a pool of chat.deepseek.com accounts (email + password). Each account is logged in to get a
              bearer token; requests pick a healthy account with automatic failover.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span
              className={`rounded-full px-3 py-1 text-xs ${
                status?.ready
                  ? "bg-emerald-50 text-emerald-700"
                  : status?.configured
                    ? "bg-amber-50 text-amber-700"
                    : "bg-stone-100 text-stone-500"
              }`}
            >
              {statusBadge}
            </span>
            <button
              type="button"
              onClick={() => void loadStatus()}
              disabled={isLoading}
              className="cursor-pointer text-xs font-medium text-stone-500 underline-offset-2 transition hover:text-stone-800 hover:underline disabled:opacity-50"
            >
              {isLoading ? "Refreshing…" : "Refresh status"}
            </button>
          </div>
        </div>

        {status?.error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-800">
            {status.error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <Users className="size-4 text-stone-400" />
            <div>
              <div className="text-sm font-medium text-stone-700">Account pool</div>
              <div className="text-xs text-stone-500">
                {accountCount > 0
                  ? `${usableCount}/${accountCount} account(s) usable`
                  : "No accounts yet — add DeepSeek email/password accounts to get started"}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="h-9 rounded-full border-stone-200 bg-white text-stone-700"
            onClick={() => window.location.assign("/deepseek-accounts")}
          >
            <ExternalLink className="size-3.5" />
            Manage accounts
          </Button>
        </div>

        <div className="space-y-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs leading-5 text-stone-500">
          <p>
            Models served when the pool is configured: <span className="font-medium text-stone-700">deepseek-chat</span>{" "}
            (fast), <span className="font-medium text-stone-700">deepseek-reasoner</span> (deep think),{" "}
            <span className="font-medium text-stone-700">deepseek-vision</span> (image inputs).
          </p>
          <p>
            Note: DeepSeek blocks logins from US IPs (WAF challenge). Set a non-US proxy on the account if login fails.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
