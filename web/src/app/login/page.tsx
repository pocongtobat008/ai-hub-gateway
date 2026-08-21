"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, Key, Sparkles, Shield, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HeaderActions } from "@/components/header-actions";
import { login } from "@/lib/api";
import { useRedirectIfAuthenticated } from "@/lib/use-auth-guard";
import { getDefaultRouteForRole, setStoredAuthSession } from "@/store/auth";

export default function LoginPage() {
  const router = useRouter();
  const [authKey, setAuthKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const { isCheckingAuth } = useRedirectIfAuthenticated();

  const handleLogin = async () => {
    const normalizedAuthKey = authKey.trim();
    if (!normalizedAuthKey) {
      toast.error("Please enter your access key or auth code");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await login(normalizedAuthKey);
      await setStoredAuthSession({
        key: normalizedAuthKey,
        role: data.role,
        subjectId: data.subject_id,
        name: data.name,
      });
      toast.success(`Welcome back, ${data.name || "User"}!`);
      router.replace(getDefaultRouteForRole(data.role));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="grid min-h-[calc(100vh-1rem)] w-full place-items-center px-4 py-6">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="size-6 animate-spin text-stone-300 dark:text-stone-600" />
          <span className="text-xs text-stone-400">Connecting...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid min-h-[100dvh] w-full place-items-center px-4 py-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
      <HeaderActions className="fixed top-4 right-4 z-10" />

      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-gradient-to-br from-indigo-200/40 to-purple-300/20 blur-3xl dark:from-indigo-800/20 dark:to-purple-700/10" />
        <div className="absolute -bottom-24 -left-24 size-96 rounded-full bg-gradient-to-tr from-indigo-300/30 to-blue-200/20 blur-3xl dark:from-indigo-700/15 dark:to-blue-800/10" />
      </div>

      <Card className="glass-card relative z-10 w-full max-w-[440px] rounded-3xl border-white/40 shadow-[0_32px_100px_rgba(0,0,0,0.08)] animate-fade-in-scale dark:border-white/5 dark:shadow-[0_32px_100px_rgba(0,0,0,0.3)]">
        <CardContent className="space-y-6 p-6 sm:space-y-7 sm:p-10">
          <div className="space-y-5 text-center">
            <div className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl">
              <Sparkles className="size-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="brand-text">BecomeAI</span>
              </h1>
              <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
                Enter your access key or auth code to start chatting.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="auth-key" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              Access Key or Auth Code
            </label>
            <div className="relative">
              <Input
                id="auth-key"
                type={showKey ? "text" : "password"}
                value={authKey}
                onChange={(event) => setAuthKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleLogin();
                  }
                }}
                placeholder="sk-... or BECOME-XXXX-XXXX"
                className="h-12 rounded-xl border-stone-200/60 bg-white/50 px-4 pr-10 text-sm backdrop-blur-sm dark:border-white/8 dark:bg-white/5"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            className="h-12 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:from-indigo-500 hover:to-purple-500 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
            onClick={() => void handleLogin()}
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {isSubmitting ? "Connecting..." : "Sign In"}
          </Button>

          <div className="space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200 dark:border-stone-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-stone-400 dark:bg-stone-900 dark:text-stone-500">
                  How to get access
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-stone-200/60 bg-stone-50/50 p-3 text-center dark:border-white/5 dark:bg-white/3">
                <Key className="mx-auto h-4 w-4 text-indigo-500 mb-1" />
                <div className="text-[11px] font-medium text-stone-700 dark:text-stone-300">API Key</div>
                <div className="text-[10px] text-stone-400">sk-xxx...</div>
              </div>
              <div className="rounded-xl border border-stone-200/60 bg-stone-50/50 p-3 text-center dark:border-white/5 dark:bg-white/3">
                <Shield className="mx-auto h-4 w-4 text-purple-500 mb-1" />
                <div className="text-[11px] font-medium text-stone-700 dark:text-stone-300">Auth Code</div>
                <div className="text-[10px] text-stone-400">BECOME-XXXX</div>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-stone-400 dark:text-stone-500">
            Powered by BecomeAI
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
