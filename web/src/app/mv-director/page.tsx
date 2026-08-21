"use client";

import { useState, useRef, useEffect } from "react";
import {
  Clapperboard,
  ExternalLink,
  RefreshCw,
  Maximize2,
  Minimize2,
  Music,
  Video,
  Sparkles,
} from "lucide-react";

const MV_DIRECTOR_URL = "http://localhost:3060";

export default function MvDirectorPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${MV_DIRECTOR_URL}/`, { mode: "no-cors" });
        setHasError(false);
      } catch {
        setHasError(true);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setIsLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = MV_DIRECTOR_URL;
    }
  };

  const toggleFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-purple-500" />
            <h1 className="text-sm font-semibold">MV Director AI</h1>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Powered by Gemini
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            title="Fullscreen"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <a
            href={MV_DIRECTOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded hover:bg-muted transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Info Cards */}
      <div className="flex gap-2 px-4 py-2 border-b bg-card/30 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded-full whitespace-nowrap">
          <Music className="w-3 h-3" />
          Music Video Storyboard
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded-full whitespace-nowrap">
          <Video className="w-3 h-3" />
          Shot List & Transitions
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded-full whitespace-nowrap">
          <Sparkles className="w-3 h-3" />
          AI Image Prompts
        </div>
      </div>

      {/* Iframe */}
      <div className="flex-1 relative">
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
            <div className="text-center space-y-3 p-6">
              <Clapperboard className="w-12 h-12 text-muted-foreground mx-auto" />
              <div>
                <p className="text-sm font-medium">MV Director AI Offline</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Service is not running on port 3060
                </p>
              </div>
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          </div>
        )}
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground">
                Loading MV Director AI...
              </p>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={MV_DIRECTOR_URL}
          className="w-full h-full border-0"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          title="MV Director AI"
          allow="microphone; camera; file-system"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      </div>
    </div>
  );
}
