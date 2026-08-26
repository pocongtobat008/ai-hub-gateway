"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  LoaderCircle,
  Mic,
  Play,
  Pause,
  Trash2,
  Volume2,
  Clock,
  Filter,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  fetchVoices,
  synthesizeVoice,
  fetchVoiceOverHistory,
  deleteVoiceOverAudio,
  type VoiceOverVoice,
  type VoiceOverResult,
} from "@/lib/api";

const POPULAR_VOICES = [
  "en-US-AriaNeural",
  "en-US-GuyNeural",
  "en-GB-SoniaNeural",
  "id-ID-GadisNeural",
  "id-ID-ArdiNeural",
  "ja-JP-NanamiNeural",
  "ko-KR-SunHiNeural",
  "zh-CN-XiaoxiaoNeural",
];

const SAMPLE_TEXTS = [
  { label: "Welcome", text: "Welcome to BecomeAI — your unified AI gateway. How can I help you today?" },
  { label: "Introduction", text: "Hi there! I'm your AI assistant powered by multiple providers including GPT, Gemini, and DeepSeek." },
  { label: "Poetry", text: "The sun sets behind the mountains, painting the sky in shades of gold and crimson. A new day draws to a close." },
  { label: "News", text: "Breaking news: Scientists have discovered a new species of deep-sea fish that can survive at extreme pressures." },
  { label: "Story", text: "Once upon a time, in a land far beyond the clouds, there lived a curious inventor who dreamed of building wings." },
];

function VoiceOverContent() {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<VoiceOverVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("en-US-AriaNeural");
  const [rate, setRate] = useState("+0%");
  const [pitch, setPitch] = useState("+0Hz");
  const [volume, setVolume] = useState("+0%");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [history, setHistory] = useState<VoiceOverResult[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [voiceFilter, setVoiceFilter] = useState("");
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadVoices = useCallback(async () => {
    setIsLoadingVoices(true);
    try {
      const data = await fetchVoices();
      setVoices(data.voices || []);
    } catch {
      toast.error("Failed to load voices");
    }
    setIsLoadingVoices(false);
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchVoiceOverHistory();
      setHistory(data.items || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadVoices();
    loadHistory();
  }, [loadVoices, loadHistory]);

  const handleSynthesize = async () => {
    if (!text.trim()) {
      toast.error("Please enter text to synthesize");
      return;
    }
    setIsSynthesizing(true);
    try {
      const result = await synthesizeVoice({
        text: text.trim(),
        voice: selectedVoice,
        rate,
        pitch,
        volume,
      });
      toast.success(`Audio generated (${result.duration}s)`);
      loadHistory();
    } catch (e: any) {
      toast.error(e?.message || "Synthesis failed");
    }
    setIsSynthesizing(false);
  };

  const handlePlay = (item: VoiceOverResult) => {
    if (isPlaying === item.id) {
      audioRef.current?.pause();
      setIsPlaying(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(item.file);
    audio.onended = () => setIsPlaying(null);
    audio.onerror = () => {
      setIsPlaying(null);
      toast.error("Failed to play audio");
    };
    audioRef.current = audio;
    audio.play();
    setIsPlaying(item.id);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteVoiceOverAudio(`${id}.mp3`);
      setHistory((prev) => prev.filter((h) => h.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleDownload = (item: VoiceOverResult) => {
    const a = document.createElement("a");
    a.href = item.file;
    a.download = `${item.id}.mp3`;
    a.click();
  };

  const filteredVoices = voices.filter((v) =>
    voiceFilter
      ? v.name.toLowerCase().includes(voiceFilter.toLowerCase()) ||
        v.gender.toLowerCase().includes(voiceFilter.toLowerCase()) ||
        v.personality.toLowerCase().includes(voiceFilter.toLowerCase())
      : true
  );

  const groupedVoices = filteredVoices.reduce(
    (acc, v) => {
      const lang = v.name.split("-").slice(0, 2).join("-");
      if (!acc[lang]) acc[lang] = [];
      acc[lang].push(v);
      return acc;
    },
    {} as Record<string, VoiceOverVoice[]>
  );

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mic className="h-6 w-6 text-purple-600" />
          Voice Over
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate natural speech from text — 324+ neural voices in 50+ languages
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Input */}
        <div className="lg:col-span-2 space-y-4">
          {/* Text Input */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Text to Speak</label>
                <span className="text-xs text-muted-foreground">{text.length} characters</span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste text here to convert to speech..."
                className="w-full h-40 rounded-xl border border-stone-200 bg-white/50 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40 dark:border-white/8 dark:bg-white/5"
              />
              <div className="flex flex-wrap gap-2">
                {SAMPLE_TEXTS.map((s) => (
                  <Button
                    key={s.label}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setText(s.text)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
              <Button
                onClick={handleSynthesize}
                disabled={isSynthesizing || !text.trim()}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium hover:from-purple-500 hover:to-indigo-500"
              >
                {isSynthesizing ? (
                  <LoaderCircle className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {isSynthesizing ? "Generating..." : "Generate Speech"}
              </Button>
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent Generations ({history.length})
              </h3>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No audio generated yet. Type some text above and click Generate.
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-stone-100 bg-stone-50/50 dark:border-white/5 dark:bg-white/3"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-full bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30"
                        onClick={() => handlePlay(item)}
                      >
                        {isPlaying === item.id ? (
                          <Pause className="h-3.5 w-3.5 text-purple-600" />
                        ) : (
                          <Play className="h-3.5 w-3.5 text-purple-600 ml-0.5" />
                        )}
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">
                          {item.text || "Audio"}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-stone-400">
                          <span>{item.voice?.split("-").pop()?.replace("Neural", "")}</span>
                          <span>·</span>
                          <span>{item.duration}s</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7"
                        onClick={() => handleDownload(item)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 text-rose-400 hover:text-rose-600"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Settings */}
        <div className="space-y-4">
          {/* Voice Selector */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <label className="text-sm font-medium flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Voice
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                  className="w-full h-10 rounded-xl border border-stone-200 bg-white/50 px-3 text-sm text-left flex items-center justify-between dark:border-white/8 dark:bg-white/5"
                >
                  <span className="truncate">{selectedVoice}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
                {showVoiceDropdown && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border bg-white shadow-lg dark:bg-stone-900 dark:border-white/10 max-h-80 overflow-hidden flex flex-col">
                    <div className="p-2 border-b dark:border-white/10">
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          type="text"
                          value={voiceFilter}
                          onChange={(e) => setVoiceFilter(e.target.value)}
                          placeholder="Search voices..."
                          className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border bg-stone-50 dark:bg-white/5 dark:border-white/10 focus:outline-none"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {isLoadingVoices ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          Loading voices...
                        </div>
                      ) : (
                        Object.entries(groupedVoices).map(([lang, langVoices]) => (
                          <div key={lang}>
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase bg-stone-50 dark:bg-white/3">
                              {lang}
                            </div>
                            {langVoices.map((v) => (
                              <button
                                key={v.name}
                                onClick={() => {
                                  setSelectedVoice(v.name);
                                  setShowVoiceDropdown(false);
                                  setVoiceFilter("");
                                }}
                                className={`w-full px-3 py-2 text-left text-xs hover:bg-stone-50 dark:hover:bg-white/5 flex items-center gap-2 ${
                                  selectedVoice === v.name ? "bg-purple-50 dark:bg-purple-900/20" : ""
                                }`}
                              >
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                                  v.gender === "Female" ? "bg-pink-400" : "bg-blue-400"
                                }`} />
                                <span className="flex-1 truncate">{v.name}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {v.gender}
                                </span>
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Popular Voices */}
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Popular</span>
                <div className="flex flex-wrap gap-1">
                  {POPULAR_VOICES.map((v) => (
                    <button
                      key={v}
                      onClick={() => setSelectedVoice(v)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                        selectedVoice === v
                          ? "bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/30 dark:border-purple-700"
                          : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100 dark:bg-white/3 dark:border-white/8"
                      }`}
                    >
                      {v.split("-").pop()?.replace("Neural", "")}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rate / Pitch / Volume */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <label className="text-xs font-medium flex items-center justify-between mb-1">
                  <span>Speed</span>
                  <span className="text-muted-foreground">{rate}</span>
                </label>
                <input
                  type="range"
                  min="-50"
                  max="100"
                  value={parseInt(rate)}
                  onChange={(e) => setRate(`${e.target.value >= 0 ? "+" : ""}${e.target.value}%`)}
                  className="w-full accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Slow</span>
                  <span>Normal</span>
                  <span>Fast</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium flex items-center justify-between mb-1">
                  <span>Pitch</span>
                  <span className="text-muted-foreground">{pitch}</span>
                </label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={parseInt(pitch)}
                  onChange={(e) => setPitch(`${e.target.value >= 0 ? "+" : ""}${e.target.value}Hz`)}
                  className="w-full accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Low</span>
                  <span>Normal</span>
                  <span>High</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium flex items-center justify-between mb-1">
                  <span>Volume</span>
                  <span className="text-muted-foreground">{volume}</span>
                </label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={parseInt(volume)}
                  onChange={(e) => setVolume(`${e.target.value >= 0 ? "+" : ""}${e.target.value}%`)}
                  className="w-full accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Quiet</span>
                  <span>Normal</span>
                  <span>Loud</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardContent className="p-3 grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-purple-600">{voices.length || "—"}</div>
                <div className="text-[10px] text-muted-foreground">Voices</div>
              </div>
              <div>
                <div className="text-lg font-bold text-indigo-600">{history.length}</div>
                <div className="text-[10px] text-muted-foreground">Generated</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function VoiceOverPage() {
  const { isCheckingAuth, session } = useAuthGuard();
  if (isCheckingAuth) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }
  if (!session) return null;
  return <VoiceOverContent />;
}
