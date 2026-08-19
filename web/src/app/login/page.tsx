"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
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
  const { isCheckingAuth } = useRedirectIfAuthenticated();

  const handleLogin = async () => {
    const normalizedAuthKey = authKey.trim();
    if (!normalizedAuthKey) {
      toast.error("Please enter your key");
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
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-gradient-to-br from-stone-200/40 to-stone-300/20 blur-3xl dark:from-stone-800/20 dark:to-stone-700/10" />
        <div className="absolute -bottom-24 -left-24 size-96 rounded-full bg-gradient-to-tr from-stone-300/30 to-stone-200/20 blur-3xl dark:from-stone-700/15 dark:to-stone-800/10" />
      </div>

      <Card className="glass-card relative z-10 w-full max-w-[440px] rounded-3xl border-white/40 shadow-[0_32px_100px_rgba(0,0,0,0.08)] animate-fade-in-scale dark:border-white/5 dark:shadow-[0_32px_100px_rgba(0,0,0,0.3)]">
        <CardContent className="space-y-6 p-6 sm:space-y-7 sm:p-10">
          <div className="space-y-5 text-center">
            <div className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-stone-800 to-stone-950 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl dark:from-stone-200 dark:to-stone-400 dark:text-stone-950">
              <Sparkles className="size-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="brand-text">Welcome to BecomeAI</span>
              </h1>
              <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
                Enter your key to access chat, image generation, and more.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="auth-key" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              Access Key
            </label>
            <Input
              id="auth-key"
              type="password"
              value={authKey}
              onChange={(event) => setAuthKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleLogin();
                }
              }}
              placeholder="Enter your key"
              className="h-12 rounded-xl border-stone-200/60 bg-white/50 px-4 text-sm backdrop-blur-sm dark:border-white/8 dark:bg-white/5"
            />
          </div>

          <Button
            className="h-12 w-full rounded-xl bg-stone-900 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:bg-stone-800 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
            onClick={() => void handleLogin()}
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {isSubmitting ? "Connecting..." : "Sign In"}
          </Button>

          <p className="text-center text-[11px] text-stone-400 dark:text-stone-500">
            Powered by BecomeAI
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
