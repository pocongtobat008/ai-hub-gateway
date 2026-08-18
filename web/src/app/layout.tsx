import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";
import { TopNav } from "@/components/top-nav";

export const metadata: Metadata = {
  title: "chatgpt2api · AI Hub",
  description: "Unified AI gateway — GPT, Gemini, DeepSeek in one place",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className="antialiased"
        style={{
          fontFamily:
            '"Inter","SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif',
        }}
      >
        <Toaster position="top-center" richColors offset={48} />
        <main className="min-h-screen overflow-x-hidden px-4 pt-0 pb-2 text-stone-900 transition-colors duration-300 dark:text-stone-100 sm:px-6 sm:pt-2 lg:px-8">
          <div className="mx-auto box-border flex min-h-screen max-w-[1440px] flex-col gap-2 pt-[env(safe-area-inset-top)] sm:gap-4 sm:pt-0">
            <TopNav />
            <div className="animate-fade-in">
              {children}
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
