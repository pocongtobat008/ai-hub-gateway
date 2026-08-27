"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Check,
  Globe,
  LoaderCircle,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
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

const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly", icon: "😊" },
  { value: "professional", label: "Professional", icon: "💼" },
  { value: "casual", label: "Casual", icon: "😎" },
  { value: "formal", label: "Formal", icon: "🎩" },
  { value: "humorous", label: "Humorous", icon: "😄" },
  { value: "direct", label: "Direct", icon: "🎯" },
];

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto (detect)" },
  { value: "english", label: "English" },
  { value: "indonesian", label: "Indonesian" },
  { value: "japanese", label: "Japanese" },
  { value: "chinese", label: "Chinese" },
  { value: "spanish", label: "Spanish" },
  { value: "arabic", label: "Arabic" },
];

const VERBOSITY_OPTIONS = [
  { value: "concise", label: "Concise" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

const EXPERTISE_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

export function ProfilePopup({ open, onClose }: ProfilePopupProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"personality" | "skills" | "instructions">("personality");
  const [isSaving, setIsSaving] = useState(false);

  // Add skill dialog
  const [addSkillOpen, setAddSkillOpen] = useState(false);
  const [newSkill, setNewSkill] = useState({ id: "", name: "", description: "", icon: "🧩", system_prompt: "" });

  const loadProfile = useCallback(async () => {
    try {
      const data = await fetchProfile();
      setProfile(data);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadProfile();
    }
  }, [open, loadProfile]);

  const handleSavePersonality = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      await updatePersonality(profile.personality);
      await updateProfile({ display_name: profile.display_name, avatar_emoji: profile.avatar_emoji });
      toast.success("Personality saved!");
    } catch {
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInstructions = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      await updateInstructions({ custom_instructions: profile.custom_instructions });
      toast.success("Instructions saved!");
    } catch {
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleSkill = async (skillId: string, enabled: boolean) => {
    try {
      await toggleSkill(skillId, enabled);
      setProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          skills: prev.skills.map((s) => (s.id === skillId ? { ...s, enabled } : s)),
        };
      });
      toast.success(enabled ? "Skill enabled!" : "Skill disabled");
    } catch {
      toast.error("Failed to toggle skill");
    }
  };

  const handleAddSkill = async () => {
    if (!newSkill.id.trim() || !newSkill.name.trim()) {
      toast.error("ID and Name are required");
      return;
    }
    try {
      const result = await addSkill(newSkill);
      if (result.ok && result.skill) {
        setProfile((prev) => {
          if (!prev) return prev;
          return { ...prev, skills: [...prev.skills, result.skill!] };
        });
        setAddSkillOpen(false);
        setNewSkill({ id: "", name: "", description: "", icon: "🧩", system_prompt: "" });
        toast.success("Skill added!");
      }
    } catch {
      toast.error("Failed to add skill");
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    try {
      await deleteSkill(skillId);
      setProfile((prev) => {
        if (!prev) return prev;
        return { ...prev, skills: prev.skills.filter((s) => s.id !== skillId) };
      });
      toast.success("Skill deleted");
    } catch {
      toast.error("Failed to delete skill");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Popup */}
      <div className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-white/10 dark:bg-stone-900 sm:max-h-[85vh]" style={{ maxHeight: '85dvh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-white">
              <User className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-900 dark:text-white">Profile & Personalization</h2>
              <p className="text-[11px] text-stone-400">Customize how AI responds to you</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 transition hover:bg-stone-100 dark:hover:bg-white/10">
            <X className="size-4 text-stone-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-100 px-5 dark:border-white/10">
          {[
            { key: "personality" as const, label: "Personality", icon: Sparkles },
            { key: "skills" as const, label: "Skills", icon: Bot },
            { key: "instructions" as const, label: "Instructions", icon: MessageSquare },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                activeTab === key
                  ? "border-stone-900 text-stone-900 dark:border-white dark:text-white"
                  : "border-transparent text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
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
              {/* Personality Tab */}
              {activeTab === "personality" && (
                <div className="space-y-5">
                  {/* Name & Avatar */}
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{profile.avatar_emoji}</div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[11px] font-medium text-stone-500">Display Name</label>
                      <Input
                        value={profile.display_name}
                        onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                        className="h-9 text-sm"
                        placeholder="Your name"
                      />
                    </div>
                  </div>

                  {/* Tone */}
                  <div>
                    <label className="mb-2 block text-[11px] font-medium text-stone-500">Tone</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {TONE_OPTIONS.map(({ value, label, icon }) => (
                        <button
                          key={value}
                          onClick={() => setProfile({ ...profile, personality: { ...profile.personality, tone: value } })}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition ${
                            profile.personality.tone === value
                              ? "border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900"
                              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-white/10 dark:bg-white/5 dark:text-stone-300"
                          }`}
                        >
                          <span>{icon}</span>
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="mb-2 block text-[11px] font-medium text-stone-500">Language</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {LANGUAGE_OPTIONS.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setProfile({ ...profile, personality: { ...profile.personality, language: value } })}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                            profile.personality.language === value
                              ? "border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900"
                              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-white/10 dark:bg-white/5 dark:text-stone-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Verbosity */}
                  <div>
                    <label className="mb-2 block text-[11px] font-medium text-stone-500">Verbosity</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {VERBOSITY_OPTIONS.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setProfile({ ...profile, personality: { ...profile.personality, verbosity: value } })}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                            profile.personality.verbosity === value
                              ? "border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900"
                              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-white/10 dark:bg-white/5 dark:text-stone-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Expertise */}
                  <div>
                    <label className="mb-2 block text-[11px] font-medium text-stone-500">Your Expertise Level</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {EXPERTISE_OPTIONS.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setProfile({ ...profile, personality: { ...profile.personality, expertise_level: value } })}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                            profile.personality.expertise_level === value
                              ? "border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900"
                              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-white/10 dark:bg-white/5 dark:text-stone-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button onClick={() => void handleSavePersonality()} disabled={isSaving} className="w-full">
                    {isSaving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
                    Save Personality
                  </Button>
                </div>
              )}

              {/* Skills Tab */}
              {activeTab === "skills" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-stone-500">Enable skills to shape AI behavior</p>
                    <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setAddSkillOpen(true)}>
                      <Plus className="size-3" />
                      Add Skill
                    </Button>
                  </div>

                  {profile.skills.map((skill) => (
                    <div
                      key={skill.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                        skill.enabled
                          ? "border-stone-900 bg-stone-50 dark:border-white/20 dark:bg-white/5"
                          : "border-stone-100 bg-white dark:border-white/5 dark:bg-white/[0.02]"
                      }`}
                    >
                      <span className="text-xl">{skill.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-stone-800 dark:text-stone-200">{skill.name}</p>
                        <p className="truncate text-[11px] text-stone-400">{skill.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!skill.id.startsWith("code-helper") && !skill.id.startsWith("creative-") && !skill.id.startsWith("data-") && !skill.id.startsWith("translator") && !skill.id.startsWith("tutor") && !skill.id.startsWith("image-expert") && !skill.id.startsWith("researcher") && !skill.id.startsWith("business-") && (
                          <button
                            onClick={() => void handleDeleteSkill(skill.id)}
                            className="rounded-lg p-1 text-stone-400 transition hover:bg-rose-50 hover:text-rose-500"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                        <button
                          onClick={() => void handleToggleSkill(skill.id, !skill.enabled)}
                          className={`flex size-7 items-center justify-center rounded-full transition ${
                            skill.enabled
                              ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                              : "bg-stone-100 text-stone-400 hover:bg-stone-200 dark:bg-white/10"
                          }`}
                        >
                          <Check className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add Skill Dialog */}
                  {addSkillOpen && (
                    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 dark:border-white/20 dark:bg-white/5">
                      <p className="mb-3 text-xs font-medium text-stone-600 dark:text-stone-300">New Custom Skill</p>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            value={newSkill.id}
                            onChange={(e) => setNewSkill({ ...newSkill, id: e.target.value })}
                            placeholder="skill-id"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={newSkill.name}
                            onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                            placeholder="Skill name"
                            className="h-8 text-xs"
                          />
                        </div>
                        <Input
                          value={newSkill.description}
                          onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
                          placeholder="Description"
                          className="h-8 text-xs"
                        />
                        <Textarea
                          value={newSkill.system_prompt}
                          onChange={(e) => setNewSkill({ ...newSkill, system_prompt: e.target.value })}
                          placeholder="System prompt for this skill..."
                          className="min-h-[60px] text-xs"
                          rows={2}
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setAddSkillOpen(false)} className="text-xs">
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => void handleAddSkill()} className="text-xs">
                            Add
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Instructions Tab */}
              {activeTab === "instructions" && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-[11px] font-medium text-stone-500">Custom Instructions</label>
                    <p className="mb-2 text-[11px] text-stone-400">
                      Tell the AI how to behave. These instructions are injected into every chat.
                    </p>
                    <Textarea
                      value={profile.custom_instructions}
                      onChange={(e) => setProfile({ ...profile, custom_instructions: e.target.value })}
                      placeholder={"Example:\n- Always respond in Indonesian\n- Use emojis in responses\n- Be concise, no longer than 3 paragraphs\n- Always include code examples when explaining programming\n- Address me by my name"}
                      className="min-h-[120px] text-sm"
                      rows={6}
                    />
                  </div>

                  <div className="rounded-xl bg-stone-50 p-3 dark:bg-white/5">
                    <p className="mb-1 text-[11px] font-medium text-stone-500">💡 Tips for effective instructions:</p>
                    <ul className="space-y-1 text-[11px] text-stone-400">
                      <li>• Be specific about tone and format</li>
                      <li>• Set boundaries (e.g., max response length)</li>
                      <li>• Define how to handle code, images, etc.</li>
                      <li>• Add your preferred language and style</li>
                    </ul>
                  </div>

                  <Button onClick={() => void handleSaveInstructions()} disabled={isSaving} className="w-full">
                    {isSaving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
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
