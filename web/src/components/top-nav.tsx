"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, ChevronDown, Menu, Sparkles } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { HeaderActions } from "@/components/header-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import webConfig from "@/constants/common-env";
import { fetchThirdPartyApps, type ThirdPartyAppsSettings } from "@/lib/api";
import { getValidatedAuthSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";
import { clearStoredAuthSession, type StoredAuthSession } from "@/store/auth";

const adminNavItems = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/image", label: "Image Gen", icon: "🎨" },
  { href: "/gemini", label: "Gemini", icon: "✨" },
];

const adminManagementItems = [
  { href: "/accounts", label: "GPT Accounts", icon: "🔑" },
  { href: "/gemini-accounts", label: "Gemini Accounts", icon: "✨" },
  { href: "/deepseek-accounts", label: "DeepSeek Accounts", icon: "🧠" },
  { href: "/image-manager", label: "Image Manager", icon: "🖼️" },
  { href: "/logs", label: "Logs", icon: "📋" },
];

const adminSystemItems = [
  { href: "/debug", label: "Debug", icon: "🔧" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const userNavItems = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/image", label: "Image Gen", icon: "🎨" },
  { href: "/gemini", label: "Gemini", icon: "✨" },
];

type NavItem = { href: string; label: string; icon?: string };

function NavDropdown({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const active = items.some((item) => pathname === item.href);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
            active
              ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
              : "text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-white dark:hover:bg-white/10",
          )}
        >
          {label}
          <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
          {active && (
            <span className="absolute inset-x-0 -bottom-[1px] hidden h-0.5 rounded-full bg-stone-900 dark:bg-white sm:block" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className="glass-card w-64 p-2 rounded-2xl">
        {items.map((item) => {
          const itemActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                itemActive
                  ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white",
              )}
            >
              {item.icon && <span className="text-xs">{item.icon}</span>}
              {item.label}
            </Link>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function buildThirdPartyHref(appUrl: string, baseUrl: string, apiKey: string) {
  const url = appUrl.trim();
  try {
    const target = new URL(url);
    target.searchParams.set("apiKey", apiKey);
    target.searchParams.set("baseUrl", baseUrl);
    return target.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(apiKey)}&baseUrl=${encodeURIComponent(baseUrl)}`;
  }
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<StoredAuthSession | null | undefined>(undefined);
  const [thirdPartyApps, setThirdPartyApps] = useState<ThirdPartyAppsSettings | null>(null);
  const [isCanvasDialogOpen, setIsCanvasDialogOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (pathname === "/login") {
        if (!active) return;
        setSession(null);
        return;
      }
      const storedSession = await getValidatedAuthSession();
      if (!active) return;
      setSession(storedSession);
    };
    void load();
    return () => { active = false; };
  }, [pathname]);

  useEffect(() => {
    if (!session) {
      setThirdPartyApps(null);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const data = await fetchThirdPartyApps();
        if (active) setThirdPartyApps(data.third_party_apps);
      } catch {
        if (active) setThirdPartyApps(null);
      }
    };
    const reload = () => void load();
    void load();
    window.addEventListener("third-party-apps-updated", reload);
    return () => { active = false; window.removeEventListener("third-party-apps-updated", reload); };
  }, [session]);

  const handleLogout = async () => {
    await clearStoredAuthSession();
    router.replace("/login");
  };

  if (pathname === "/login" || session === undefined || !session) {
    return null;
  }

  const navItems = session.role === "admin" ? adminNavItems : userNavItems;
  const managementItems = session.role === "admin" ? adminManagementItems : [];
  const systemItems = session.role === "admin" ? adminSystemItems : [];
  const roleLabel = session.role === "admin" ? "Admin" : "User";
  const displayName = session.name.trim() || roleLabel;
  const baseUrl = webConfig.apiUrl.replace(/\/$/, "") || window.location.origin;
  const canvas = thirdPartyApps?.infinite_canvas;
  const canvasHref = canvas?.enabled && canvas.url.trim() ? buildThirdPartyHref(canvas.url, baseUrl, session.key) : "";
  const canvasDisplayHref = canvasHref ? decodeURIComponent(canvasHref) : "";

  const handleCanvasOpen = () => {
    if (!canvasHref) return;
    setIsCanvasDialogOpen(true);
  };

  const confirmCanvasOpen = () => {
    if (canvasHref) window.open(canvasHref, "_blank", "noopener,noreferrer");
    setIsCanvasDialogOpen(false);
  };

  return (
    <>
      <header className="glass-strong sticky top-0 z-50 border-b border-white/40 dark:border-white/5">
        <div className="flex min-h-14 flex-col gap-1 px-3 py-2 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-0">
          {/* Left: Brand + Mobile menu */}
          <div className="flex items-center justify-between gap-3 sm:justify-start">
            <Sheet>
              <SheetTrigger className="inline-flex size-9 items-center justify-center rounded-xl text-stone-600 transition-all duration-200 hover:bg-stone-100 hover:text-stone-950 sm:hidden dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white">
                <Menu className="size-4.5" />
                <span className="sr-only">Open navigation</span>
              </SheetTrigger>
              <SheetContent side="left" className="glass w-72">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-left">
                    <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-stone-900 to-stone-700 text-white dark:from-white dark:to-stone-300 dark:text-stone-900">
                      <Sparkles className="size-4" />
                    </div>
                    <div>
                      <span className="text-base font-bold brand-text">chatgpt2api</span>
                      <span className="block text-[10px] font-medium text-stone-400 dark:text-stone-500">{roleLabel} · {displayName}</span>
                    </div>
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-8 flex flex-col gap-1">
                  {canvasHref ? (
                    <SheetClose asChild>
                      <button type="button" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-stone-600 transition-all duration-150 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white">
                        <span>📐</span> Infinite Canvas
                      </button>
                    </SheetClose>
                  ) : null}
                  {navItems.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                            active ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white",
                          )}
                        >
                          {item.icon && <span className="text-xs">{item.icon}</span>}
                          {item.label}
                        </Link>
                      </SheetClose>
                    );
                  })}
                  {managementItems.length > 0 && (
                    <>
                      <div className="mt-4 mb-1 px-3 text-[10px] font-semibold tracking-[0.2em] text-stone-400 uppercase dark:text-stone-500">Management</div>
                      {managementItems.map((item) => {
                        const active = pathname === item.href;
                        return (
                          <SheetClose asChild key={item.href}>
                            <Link
                              href={item.href}
                              className={cn(
                                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                                active ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white",
                              )}
                            >
                              {item.icon && <span className="text-xs">{item.icon}</span>}
                              {item.label}
                            </Link>
                          </SheetClose>
                        );
                      })}
                    </>
                  )}
                  {systemItems.length > 0 && (
                    <>
                      <div className="mt-4 mb-1 px-3 text-[10px] font-semibold tracking-[0.2em] text-stone-400 uppercase dark:text-stone-500">System</div>
                      {systemItems.map((item) => {
                        const active = pathname === item.href;
                        return (
                          <SheetClose asChild key={item.href}>
                            <Link
                              href={item.href}
                              className={cn(
                                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                                active ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white",
                              )}
                            >
                              {item.icon && <span className="text-xs">{item.icon}</span>}
                              {item.label}
                            </Link>
                          </SheetClose>
                        );
                      })}
                    </>
                  )}
                </nav>
                <SheetFooter>
                  <button
                    type="button"
                    className="rounded-xl border border-stone-200 px-3 py-2.5 text-left text-sm font-medium text-stone-500 transition-all duration-150 hover:text-stone-950 dark:border-white/10 dark:text-stone-300 dark:hover:text-white"
                    onClick={() => void handleLogout()}
                  >
                    Logout
                  </button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            {/* Brand logo */}
            <Link href="/chat" className="group shrink-0 flex items-center gap-2 py-1 transition-all duration-300 hover:opacity-80">
              <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-stone-900 to-stone-700 text-white shadow-md transition-all duration-300 group-hover:shadow-lg group-hover:scale-105 dark:from-white dark:to-stone-300 dark:text-stone-900">
                <Sparkles className="size-4" />
              </div>
              <span className="hidden text-[15px] font-bold tracking-tight brand-text sm:block">
                chatgpt2api
              </span>
            </Link>

            <HeaderActions className="ml-auto sm:hidden" showGithubText={false} />
          </div>

          {/* Center: Desktop nav */}
          <nav className="hide-scrollbar -mx-1 hidden min-w-0 flex-1 gap-1 overflow-x-auto px-1 sm:mx-0 sm:flex sm:justify-center sm:gap-2 sm:overflow-visible sm:px-0">
            {canvasHref && (
              <button type="button" onClick={handleCanvasOpen} className="group relative shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium text-stone-500 transition-all duration-200 hover:text-stone-900 hover:bg-stone-100 sm:text-[14px] dark:text-stone-400 dark:hover:text-white dark:hover:bg-white/10">
                📐 Canvas
              </button>
            )}
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-200 sm:text-[14px]",
                    active
                      ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-white dark:hover:bg-white/10",
                  )}
                >
                  {item.icon && <span className="mr-1 text-xs">{item.icon}</span>}
                  {item.label}
                </Link>
              );
            })}
            {managementItems.length > 0 && (
              <NavDropdown label="Management" items={managementItems} pathname={pathname} />
            )}
            {systemItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-200 sm:text-[14px]",
                    active
                      ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-white dark:hover:bg-white/10",
                  )}
                >
                  {item.icon && <span className="mr-1 text-xs">{item.icon}</span>}
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: Actions + User */}
          <div className="hidden items-center justify-end gap-3 sm:flex">
            <HeaderActions />
            <div className="flex items-center gap-2 rounded-full bg-stone-100/80 px-3 py-1.5 dark:bg-white/6">
              <div className="flex size-5 items-center justify-center rounded-full bg-gradient-to-br from-stone-700 to-stone-900 text-[9px] font-bold text-white dark:from-stone-300 dark:to-stone-500 dark:text-stone-900">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden text-xs font-medium text-stone-500 dark:text-stone-400 sm:inline-block">
                {displayName}
              </span>
            </div>
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-400 transition-all duration-200 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-200"
              onClick={() => void handleLogout()}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Canvas Dialog */}
      <Dialog open={isCanvasDialogOpen} onOpenChange={setIsCanvasDialogOpen}>
        <DialogContent showCloseButton={false} className="glass-card rounded-2xl p-6 sm:max-w-lg animate-fade-in-scale">
          <DialogHeader className="gap-2">
            <DialogTitle className="flex items-center gap-2">
              <span className="text-lg">📐</span>
              Open third-party app
            </DialogTitle>
            <DialogDescription className="text-sm leading-6">
              This entry is for personal testing only. For long-term use, consider deploying locally. The redirect URL includes this project&apos;s address and your current key to auto-fill the connection info.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-xs font-medium text-stone-500">Full redirect URL</div>
            <div className="max-h-28 overflow-auto break-all rounded-xl border border-stone-200/50 bg-stone-50/50 px-3 py-2 font-mono text-xs leading-5 text-stone-700 dark:border-white/5 dark:bg-white/3">
              {canvasDisplayHref}
            </div>
          </div>
          <DialogFooter className="pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="rounded-xl border-stone-200 bg-white/80 text-stone-700 dark:border-white/10 dark:bg-white/5">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" className="rounded-xl bg-stone-900 text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200" onClick={confirmCanvasOpen}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
