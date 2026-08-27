"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Briefcase,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Code,
  FileSearch,
  Globe,
  GraduationCap,
  Languages,
  LoaderCircle,
  MessageSquare,
  Palette,
  PenTool,
  Plus,
  Search,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addSkill,
  deleteSkill,
  fetchProfile,
  toggleSkill,
  updateInstructions,
  updatePersonality,
  updateProfile,
  type Profile,
  type Skill,
} from "@/lib/api";

type ProfilePopupProps = {
  open: boolean;
  onClose: () => void;
};

// ── Icon map for skills (replace emoji with lucide icons) ────────────────────

const SKILL_ICONS: Record<string, React.ElementType> = {
  code: Code,
  pen: PenTool,
  chart: FileSearch,
  globe: Globe,
  graduation: GraduationCap,
  palette: Palette,
  search: Search,
  briefcase: Briefcase,
  book: BookOpen,
  brain: Brain,
  bot: Bot,
  language: Languages,
  message: MessageSquare,
  sparkles: Sparkles,
};

function SkillIcon({ icon, className }: { icon: string; className?: string }) {
  // If it's a lucide icon key, use it
  const LucideIcon = SKILL_ICONS[icon];
  if (LucideIcon) return <LucideIcon className={className} />;
  // Otherwise render as text (for custom emoji)
  return <span className={className} style={{ fontSize: "1.1em" }}>{icon}</span>;
}

// ── Personality options ──────────────────────────────────────────────────────

const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly", desc: "Warm and approachable" },
  { value: "professional", label: "Professional", desc: "Clear and business-like" },
  { value: "casual", label: "Casual", desc: "Relaxed and informal" },
  { value: "formal", label: "Formal", desc: "Structured and proper" },
  { value: "humorous", label: "Humorous", desc: "Witty and fun" },
  { value: "direct", label: "Direct", desc: "Straight to the point" },
];

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "english", label: "English" },
  { value: "indonesian", label: "Indonesian" },
  { value: "japanese", label: "Japanese" },
  { value: "chinese", label: "Chinese" },
  { value: "spanish", label: "Spanish" },
  { value: "arabic", label: "Arabic" },
  { value: "french", label: "French" },
];

const VERBOSITY_OPTIONS = [
  { value: "concise", label: "Concise", desc: "Short and to the point" },
  { value: "balanced", label: "Balanced", desc: "Moderate detail" },
  { value: "detailed", label: "Detailed", desc: "Thorough explanations" },
];

const EXPERTISE_OPTIONS = [
  { value: "beginner", label: "Beginner", desc: "New to the topic" },
  { value: "intermediate", label: "Intermediate", desc: "Some experience" },
  { value: "advanced", label: "Advanced", desc: "Experienced user" },
  { value: "expert", label: "Expert", desc: "Deep knowledge" },
];

// ── Built-in skills with lucide icons ────────────────────────────────────────

const BUILTIN_SKILLS: Record<string, { icon: string; label: string; desc: string; category?: string }> = {
  // General
  "code-helper": { icon: "code", label: "Code Helper", desc: "Write, debug, and explain code" },
  "creative-writer": { icon: "pen", label: "Creative Writer", desc: "Stories, articles, creative content" },
  "data-analyst": { icon: "chart", label: "Data Analyst", desc: "Analyze data and find insights" },
  "translator": { icon: "language", label: "Translator", desc: "Translate between languages" },
  "tutor": { icon: "graduation", label: "Tutor", desc: "Explain concepts step by step" },
  "image-expert": { icon: "palette", label: "Image Expert", desc: "Generate image prompts" },
  "researcher": { icon: "search", label: "Researcher", desc: "Deep research with citations" },
  "business-advisor": { icon: "briefcase", label: "Business Advisor", desc: "Strategy and financial advice" },
  // AI Research (Orchestra-Research)
  "ai-autoresearch": { icon: "brain", label: "Auto Research", desc: "Autonomous research orchestration", category: "AI Research" },
  "ai-ideation": { icon: "sparkles", label: "Research Ideation", desc: "Brainstorm novel research ideas", category: "AI Research" },
  "ai-paper-writing": { icon: "pen", label: "ML Paper Writing", desc: "Academic paper writing (LaTeX)", category: "AI Research" },
  "ai-fine-tuning": { icon: "code", label: "Fine-Tuning Expert", desc: "LoRA, PEFT, Axolotl, Unsloth", category: "AI Research" },
  "ai-prompt-eng": { icon: "sparkles", label: "Prompt Engineering", desc: "CoT, Few-shot, ReAct, ToT", category: "AI Research" },
  "ai-rag": { icon: "search", label: "RAG Expert", desc: "Retrieval-Augmented Generation", category: "AI Research" },
  "ai-agents": { icon: "bot", label: "AI Agents", desc: "Autonomous agents & tool use", category: "AI Research" },
  "ai-inference": { icon: "bot", label: "Inference & Serving", desc: "vLLM, TensorRT-LLM, SGLang", category: "AI Research" },
  "ai-safety": { icon: "shield", label: "AI Safety & Alignment", desc: "RLHF, red-teaming, guardrails", category: "AI Research" },
  "ai-distributed": { icon: "brain", label: "Distributed Training", desc: "DeepSpeed, FSDP, Megatron", category: "AI Research" },
  "ai-evaluation": { icon: "chart", label: "Model Evaluation", desc: "Benchmarks, metrics, testing", category: "AI Research" },
  "ai-data": { icon: "chart", label: "Data Processing", desc: "NeMo Curator, dedup, quality", category: "AI Research" },
  "ai-optimization": { icon: "code", label: "Model Optimization", desc: "Quantization, pruning, distill", category: "AI Research" },
  "ai-mlops": { icon: "code", label: "MLOps", desc: "CI/CD, experiment tracking", category: "AI Research" },
};

export function ProfilePopup({ open, onClose }: ProfilePopupProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"personality" | "skills" | "instructions">("personality");
  const [isSaving, setIsSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Add skill
  const [addSkillOpen, setAddSkillOpen] = useState(false);
  const [newSkill, setNewSkill] = useState({ id: "", name: "", description: "", icon: "sparkles", system_prompt: "" });

  const loadProfile = useCallback(async () => {
    try {
      const data = await fetchProfile();
      setProfile(data);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    if (open) { void loadProfile(); }
  }, [open, loadProfile]);

  const handleSavePersonality = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      await updatePersonality(profile.personality);
      await updateProfile({ display_name: profile.display_name, avatar_emoji: profile.avatar_emoji });
      toast.success("Personality saved!");
    } catch { toast.error("Failed to save"); }
    finally { setIsSaving(false); }
  };

  const handleSaveInstructions = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      await updateInstructions({ custom_instructions: profile.custom_instructions });
      toast.success("Instructions saved!");
    } catch { toast.error("Failed to save"); }
    finally { setIsSaving(false); }
  };

  const handleToggleSkill = async (skillId: string) => {
    if (!profile) return;
    const skill = profile.skills.find((s) => s.id === skillId);
    if (!skill) return;
    const newEnabled = !skill.enabled;
    setTogglingId(skillId);
    try {
      await toggleSkill(skillId, newEnabled);
      setProfile((prev) => {
        if (!prev) return prev;
        return { ...prev, skills: prev.skills.map((s) => (s.id === skillId ? { ...s, enabled: newEnabled } : s)) };
      });
      toast.success(newEnabled ? `"${skill.name}" enabled` : `"${skill.name}" disabled`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    } finally { setTogglingId(null); }
  };

  const handleAddSkill = async () => {
    if (!newSkill.id.trim() || !newSkill.name.trim()) {
      toast.error("ID and Name are required");
      return;
    }
    try {
      const result = await addSkill(newSkill);
      if (result.ok && result.skill) {
        setProfile((prev) => prev ? { ...prev, skills: [...prev.skills, result.skill!] } : prev);
        setAddSkillOpen(false);
        setNewSkill({ id: "", name: "", description: "", icon: "sparkles", system_prompt: "" });
        toast.success("Skill added!");
      }
    } catch { toast.error("Failed to add skill"); }
  };

  const handleDeleteSkill = async (skillId: string) => {
    try {
      await deleteSkill(skillId);
      setProfile((prev) => prev ? { ...prev, skills: prev.skills.filter((s) => s.id !== skillId) } : prev);
      toast.success("Skill deleted");
    } catch { toast.error("Failed to delete"); }
  };

  if (!open) return null;

  const enabledCount = profile?.skills.filter((s) => s.enabled).length || 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-white/10 dark:bg-stone-900" style={{ maxHeight: "88dvh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-stone-700 to-stone-900 text-white shadow-lg shadow-stone-500/25">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-white">Profile & Personalization</h2>
              <p className="text-[11px] text-stone-400">Shape how AI responds to you</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 transition hover:bg-stone-100 dark:hover:bg-white/10">
            <X className="size-4 text-stone-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-100 px-5 dark:border-white/10">
          {([
            { key: "personality" as const, label: "Personality", icon: Brain, count: null },
            { key: "skills" as const, label: "Skills", icon: Bot, count: enabledCount },
            { key: "instructions" as const, label: "Instructions", icon: MessageSquare, count: null },
          ]).map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`relative flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-all ${
                activeTab === key
                  ? "border-stone-500 text-stone-700 dark:text-stone-400"
                  : "border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
              {count !== null && count > 0 && (
                <span className="ml-0.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold text-stone-700 dark:bg-stone-900/30 dark:text-stone-400">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderCircle className="size-5 animate-spin text-stone-400" />
            </div>
          ) : !profile ? (
            <p className="py-8 text-center text-sm text-stone-400">Failed to load profile</p>
          ) : (
            <>
              {/* ─── Personality Tab ───────────────────────────────────────── */}
              {activeTab === "personality" && (
                <div className="space-y-5">
                  {/* Name */}
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">Display Name</label>
                    <Input
                      value={profile.display_name}
                      onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                      className="h-9 text-sm"
                      placeholder="Your name"
                    />
                  </div>

                  {/* Tone */}
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">Communication Tone</label>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {TONE_OPTIONS.map(({ value, label, desc }) => (
                        <button
                          key={value}
                          onClick={() => setProfile({ ...profile, personality: { ...profile.personality, tone: value } })}
                          className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                            profile.personality.tone === value
                              ? "border-stone-500 bg-stone-50 shadow-sm dark:border-stone-400 dark:bg-stone-500/10"
                              : "border-stone-100 bg-white hover:border-stone-200 hover:bg-stone-50 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-white/10"
                          }`}
                        >
                          <p className={`text-xs font-semibold ${profile.personality.tone === value ? "text-stone-800 dark:text-stone-300" : "text-stone-700 dark:text-stone-200"}`}>{label}</p>
                          <p className="text-[10px] text-stone-400">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">Response Language</label>
                    <div className="flex flex-wrap gap-1.5">
                      {LANGUAGE_OPTIONS.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setProfile({ ...profile, personality: { ...profile.personality, language: value } })}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                            profile.personality.language === value
                              ? "border-stone-500 bg-stone-50 text-stone-800 dark:border-stone-400 dark:bg-stone-500/10 dark:text-stone-300"
                              : "border-stone-100 bg-white text-stone-500 hover:border-stone-200 dark:border-white/5 dark:bg-white/[0.02] dark:text-stone-400"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Verbosity */}
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">Response Length</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {VERBOSITY_OPTIONS.map(({ value, label, desc }) => (
                        <button
                          key={value}
                          onClick={() => setProfile({ ...profile, personality: { ...profile.personality, verbosity: value } })}
                          className={`rounded-xl border px-3 py-2.5 text-center transition-all ${
                            profile.personality.verbosity === value
                              ? "border-stone-500 bg-stone-50 dark:border-stone-400 dark:bg-stone-500/10"
                              : "border-stone-100 bg-white hover:border-stone-200 dark:border-white/5 dark:bg-white/[0.02]"
                          }`}
                        >
                          <p className={`text-xs font-semibold ${profile.personality.verbosity === value ? "text-stone-800 dark:text-stone-300" : "text-stone-700 dark:text-stone-200"}`}>{label}</p>
                          <p className="text-[10px] text-stone-400">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Expertise */}
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">Your Expertise Level</label>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {EXPERTISE_OPTIONS.map(({ value, label, desc }) => (
                        <button
                          key={value}
                          onClick={() => setProfile({ ...profile, personality: { ...profile.personality, expertise_level: value } })}
                          className={`rounded-xl border px-3 py-2 text-center transition-all ${
                            profile.personality.expertise_level === value
                              ? "border-stone-500 bg-stone-50 dark:border-stone-400 dark:bg-stone-500/10"
                              : "border-stone-100 bg-white hover:border-stone-200 dark:border-white/5 dark:bg-white/[0.02]"
                          }`}
                        >
                          <p className={`text-xs font-semibold ${profile.personality.expertise_level === value ? "text-stone-800 dark:text-stone-300" : "text-stone-700 dark:text-stone-200"}`}>{label}</p>
                          <p className="text-[10px] text-stone-400">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button onClick={() => void handleSavePersonality()} disabled={isSaving} className="w-full bg-stone-700 hover:bg-stone-800">
                    {isSaving && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                    Save Personality
                  </Button>
                </div>
              )}

              {/* ─── Skills Tab ────────────────────────────────────────────── */}
              {activeTab === "skills" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-stone-500">{enabledCount} skill{enabledCount !== 1 ? "s" : ""} active</p>
                    <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setAddSkillOpen(true)}>
                      <Plus className="size-3" />
                      Custom
                    </Button>
                  </div>

                  {profile.skills.map((skill) => {
                    const builtin = BUILTIN_SKILLS[skill.id];
                    const iconKey = builtin?.icon || "sparkles";
                    const label = builtin?.label || skill.name;
                    const desc = builtin?.desc || skill.description;

                    return (
                      <div
                        key={skill.id}
                        className={`group flex items-center gap-3 rounded-xl border px-3 py-3 transition-all ${
                          skill.enabled
                            ? "border-stone-200 bg-stone-50/50 dark:border-stone-500/20 dark:bg-stone-500/5"
                            : "border-stone-100 bg-white hover:border-stone-200 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-white/10"
                        }`}
                      >
                        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition ${
                          skill.enabled
                            ? "bg-stone-100 text-stone-700 dark:bg-stone-500/20 dark:text-stone-400"
                            : "bg-stone-100 text-stone-400 dark:bg-white/5 dark:text-stone-500"
                        }`}>
                          <SkillIcon icon={iconKey} className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-semibold ${skill.enabled ? "text-stone-800 dark:text-stone-100" : "text-stone-600 dark:text-stone-300"}`}>
                            {label}
                          </p>
                          <p className="truncate text-[11px] text-stone-400">{desc}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {!skill.id.startsWith("code-helper") && !skill.id.startsWith("creative-") && !skill.id.startsWith("data-") && !skill.id.startsWith("translator") && !skill.id.startsWith("tutor") && !skill.id.startsWith("image-expert") && !skill.id.startsWith("researcher") && !skill.id.startsWith("business-") && (
                            <button
                              onClick={() => void handleDeleteSkill(skill.id)}
                              className="rounded-lg p-1.5 text-stone-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100 dark:text-stone-600"
                            >
                              <X className="size-3" />
                            </button>
                          )}
                          <button
                            onClick={() => void handleToggleSkill(skill.id)}
                            disabled={togglingId === skill.id}
                            className={`flex size-8 items-center justify-center rounded-full border-2 transition-all ${
                              skill.enabled
                                ? "border-stone-500 bg-stone-500 text-white shadow-sm shadow-stone-500/25"
                                : "border-stone-200 bg-white text-stone-300 hover:border-stone-300 dark:border-white/10 dark:bg-transparent dark:text-stone-600"
                            }`}
                          >
                            {togglingId === skill.id ? (
                              <LoaderCircle className="size-3.5 animate-spin" />
                            ) : (
                              <Check className="size-3.5" strokeWidth={3} />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add Skill Form */}
                  {addSkillOpen && (
                    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/50 p-4 dark:border-stone-500/30 dark:bg-stone-500/5">
                      <p className="mb-3 text-xs font-semibold text-stone-800 dark:text-stone-300">New Custom Skill</p>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input value={newSkill.id} onChange={(e) => setNewSkill({ ...newSkill, id: e.target.value })} placeholder="skill-id (e.g. math-tutor)" className="h-8 text-xs" />
                          <Input value={newSkill.name} onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })} placeholder="Skill name" className="h-8 text-xs" />
                        </div>
                        <Input value={newSkill.description} onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })} placeholder="Short description" className="h-8 text-xs" />
                        <Textarea value={newSkill.system_prompt} onChange={(e) => setNewSkill({ ...newSkill, system_prompt: e.target.value })} placeholder="System prompt: tell AI how to behave when this skill is active..." className="min-h-[60px] text-xs" rows={2} />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setAddSkillOpen(false)} className="text-xs">Cancel</Button>
                          <Button size="sm" onClick={() => void handleAddSkill()} className="bg-stone-700 hover:bg-stone-800 text-xs">Add Skill</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Instructions Tab ──────────────────────────────────────── */}
              {activeTab === "instructions" && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">Custom Instructions</label>
                    <p className="mb-3 text-[11px] text-stone-400">
                      Define persistent rules. These are injected into every chat as system context.
                    </p>
                    <Textarea
                      value={profile.custom_instructions}
                      onChange={(e) => setProfile({ ...profile, custom_instructions: e.target.value })}
                      placeholder={"Examples:\n\n• Always respond in Indonesian\n• Use bullet points for lists\n• Max 3 paragraphs per response\n• Include code examples when explaining programming\n• Be encouraging and supportive\n• When generating images, use a cinematic style"}
                      className="min-h-[150px] text-sm leading-relaxed"
                      rows={8}
                    />
                  </div>

                  <div className="rounded-xl border border-stone-100 bg-stone-50 p-4 dark:border-white/5 dark:bg-white/[0.02]">
                    <p className="mb-2 text-[11px] font-semibold text-stone-600 dark:text-stone-300">💡 Writing effective instructions:</p>
                    <ul className="space-y-1.5 text-[11px] text-stone-400">
                      <li className="flex items-start gap-1.5"><span className="mt-0.5 size-1 shrink-0 rounded-full bg-stone-400" /> Be specific about format and structure</li>
                      <li className="flex items-start gap-1.5"><span className="mt-0.5 size-1 shrink-0 rounded-full bg-stone-400" /> Set response boundaries (length, style)</li>
                      <li className="flex items-start gap-1.5"><span className="mt-0.5 size-1 shrink-0 rounded-full bg-stone-400" /> Define behavior for code, images, data</li>
                      <li className="flex items-start gap-1.5"><span className="mt-0.5 size-1 shrink-0 rounded-full bg-stone-400" /> Add your preferred language and tone</li>
                      <li className="flex items-start gap-1.5"><span className="mt-0.5 size-1 shrink-0 rounded-full bg-stone-400" /> Use bullet points for readability</li>
                    </ul>
                  </div>

                  <Button onClick={() => void handleSaveInstructions()} disabled={isSaving} className="w-full bg-stone-700 hover:bg-stone-800">
                    {isSaving && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                    Save Instructions
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
