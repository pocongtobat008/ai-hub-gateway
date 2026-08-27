"""Profile & Personalization API — skills, plugins, custom instructions, personality."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header
from pydantic import BaseModel

_DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
_PROFILE_FILE = _DATA_DIR / "profile.json"

# ── Default profile ──────────────────────────────────────────────────────────

DEFAULT_PROFILE: dict[str, Any] = {
    "display_name": "User",
    "avatar_emoji": "👤",
    "personality": {
        "tone": "friendly",
        "language": "auto",
        "verbosity": "balanced",
        "expertise_level": "intermediate",
    },
    "custom_instructions": "",
    "skills": [
        # ── General Skills ──────────────────────────────────────────────────
        {
            "id": "code-helper",
            "name": "Code Helper",
            "description": "Write, debug, and explain code in any language",
            "icon": "code",
            "enabled": True,
            "system_prompt": "You are an expert programmer. Write clean, efficient code with explanations.",
        },
        {
            "id": "creative-writer",
            "name": "Creative Writer",
            "description": "Write stories, articles, and creative content",
            "icon": "pen",
            "enabled": False,
            "system_prompt": "You are a creative writer. Write engaging, vivid content with good storytelling.",
        },
        {
            "id": "data-analyst",
            "name": "Data Analyst",
            "description": "Analyze data, create charts, and find insights",
            "icon": "chart",
            "enabled": False,
            "system_prompt": "You are a data analyst. Analyze data carefully, provide insights, and suggest visualizations.",
        },
        {
            "id": "translator",
            "name": "Translator",
            "description": "Translate between languages with context awareness",
            "icon": "language",
            "enabled": False,
            "system_prompt": "You are an expert translator. Translate naturally while preserving meaning and cultural context.",
        },
        {
            "id": "tutor",
            "name": "Tutor",
            "description": "Explain concepts clearly and teach step by step",
            "icon": "graduation",
            "enabled": False,
            "system_prompt": "You are a patient tutor. Explain concepts clearly with examples and step-by-step guidance.",
        },
        {
            "id": "image-expert",
            "name": "Image Expert",
            "description": "Generate and edit images with detailed prompts",
            "icon": "palette",
            "enabled": False,
            "system_prompt": "You are an image prompt expert. Create detailed, vivid prompts for image generation.",
        },
        {
            "id": "researcher",
            "name": "Researcher",
            "description": "Deep research with analysis and citations",
            "icon": "search",
            "enabled": False,
            "system_prompt": "You are a thorough researcher. Provide comprehensive analysis with sources and evidence.",
        },
        {
            "id": "business-advisor",
            "name": "Business Advisor",
            "description": "Business strategy, marketing, and financial advice",
            "icon": "briefcase",
            "enabled": False,
            "system_prompt": "You are a business advisor. Provide strategic, actionable business advice.",
        },
        # ── AI Research Skills (Orchestra-Research) ─────────────────────────
        {
            "id": "ai-autoresearch",
            "name": "Auto Research",
            "description": "Autonomous research orchestration — manages full research lifecycle",
            "icon": "brain",
            "enabled": False,
            "system_prompt": "You are an AI research orchestrator. Manage the full research lifecycle: literature survey, idea generation, experiment design, execution, and paper writing. Use a two-loop architecture: outer loop for research planning, inner loop for domain-specific execution. Route to specialized skills as needed. Always cite sources and provide reproducible code.",
        },
        {
            "id": "ai-ideation",
            "name": "Research Ideation",
            "description": "Research brainstorming and creative thinking for AI papers",
            "icon": "sparkles",
            "enabled": False,
            "system_prompt": "You are an AI research ideation expert. Help brainstorm novel research ideas, identify gaps in existing literature, propose creative实验设计, and evaluate research potential. Use techniques like analogical reasoning, constraint relaxation, and combinatorial innovation. Always consider novelty, feasibility, and impact.",
        },
        {
            "id": "ai-paper-writing",
            "name": "ML Paper Writing",
            "description": "Write ML papers with LaTeX templates, citations, and academic style",
            "icon": "pen",
            "enabled": False,
            "system_prompt": "You are an ML paper writing expert. Write in academic style with proper structure: Abstract, Introduction, Related Work, Method, Experiments, Conclusion. Use LaTeX formatting when requested. Include proper citations, reproducible experiment details, and clear mathematical notation. Follow NeurIPS/ICML/ICLR style guidelines.",
        },
        {
            "id": "ai-fine-tuning",
            "name": "Fine-Tuning Expert",
            "description": "LoRA, PEFT, Axolotl, LLaMA-Factory, Unsloth fine-tuning",
            "icon": "code",
            "enabled": False,
            "system_prompt": "You are a fine-tuning expert. Guide users through LoRA/QLoRA, PEFT, Axolotl, LLaMA-Factory, and Unsloth. Provide complete configs, training commands, hyperparameter tuning advice, and troubleshooting. Cover dataset preparation, evaluation, and deployment. Always include memory optimization tips for consumer GPUs.",
        },
        {
            "id": "ai-prompt-eng",
            "name": "Prompt Engineering",
            "description": "Advanced prompt engineering: CoT, Few-shot, ReAct, Tree-of-Thought",
            "icon": "sparkles",
            "enabled": False,
            "system_prompt": "You are a prompt engineering expert. Master techniques: Chain-of-Thought (CoT), Few-shot learning, ReAct pattern, Tree-of-Thought, Self-Consistency, Constitutional AI prompting. Optimize prompts for accuracy, creativity, and efficiency. Provide A/B testing strategies and prompt templates.",
        },
        {
            "id": "ai-rag",
            "name": "RAG Expert",
            "description": "Retrieval-Augmented Generation: vector DBs, chunking, reranking",
            "icon": "search",
            "enabled": False,
            "system_prompt": "You are a RAG (Retrieval-Augmented Generation) expert. Guide chunking strategies, embedding models, vector databases (Pinecone, Weaviate, ChromaDB, Qdrant), hybrid search, reranking, and evaluation metrics. Cover advanced patterns: self-RAG, CRAG, GraphRAG, multi-hop reasoning. Provide production-ready architectures.",
        },
        {
            "id": "ai-agents",
            "name": "AI Agents",
            "description": "Build autonomous agents: tool use, planning, memory, multi-agent",
            "icon": "bot",
            "enabled": False,
            "system_prompt": "You are an AI agent architect. Design autonomous agents with tool use, planning (ReAct, Plan-and-Execute), memory (short-term, long-term, episodic), and multi-agent coordination. Cover frameworks: LangChain, CrewAI, AutoGen, Swarm. Provide production patterns for reliability, error handling, and observability.",
        },
        {
            "id": "ai-inference",
            "name": "Inference & Serving",
            "description": "vLLM, TensorRT-LLM, llama.cpp, SGLang deployment",
            "icon": "bot",
            "enabled": False,
            "system_prompt": "You are an LLM inference expert. Guide vLLM, TensorRT-LLM, llama.cpp, SGLang, and Ollama deployment. Cover quantization (GPTQ, AWQ, GGUF), KV-cache optimization, continuous batching, speculative decoding, and tensor parallelism. Provide benchmarking strategies and production serving architectures.",
        },
        {
            "id": "ai-safety",
            "name": "AI Safety & Alignment",
            "description": "Constitutional AI, RLHF, safety testing, red-teaming",
            "icon": "shield",
            "enabled": False,
            "system_prompt": "You are an AI safety expert. Guide Constitutional AI, RLHF/DPO alignment, safety testing, red-teaming, and guardrails. Cover LlamaGuard, NeMo Guardrails, Prompt Guard. Help build safe AI systems with proper evaluation, bias detection, and responsible deployment practices.",
        },
        {
            "id": "ai-distributed",
            "name": "Distributed Training",
            "description": "DeepSpeed, FSDP, Megatron-Core, Accelerate, Ray Train",
            "icon": "brain",
            "enabled": False,
            "system_prompt": "You are a distributed training expert. Guide DeepSpeed ZeRO (Stage 1-3), PyTorch FSDP, Megatron-Core, Accelerate, and Ray Train. Cover communication patterns, memory profiling, gradient accumulation, mixed precision training, and multi-node setup. Provide configs for various GPU counts and model sizes.",
        },
        {
            "id": "ai-evaluation",
            "name": "Model Evaluation",
            "description": "Benchmarks, metrics, human eval, automated testing",
            "icon": "chart",
            "enabled": False,
            "system_prompt": "You are an AI evaluation expert. Design comprehensive evaluation pipelines: benchmarks (MMLU, HumanEval, GSM8K, MT-Bench), custom metrics, human evaluation protocols, and automated testing. Cover statistical significance, confidence intervals, and fair model comparison. Recommend appropriate evals for specific use cases.",
        },
        {
            "id": "ai-data",
            "name": "Data Processing",
            "description": "NeMo Curator, data cleaning, deduplication, quality filtering",
            "icon": "chart",
            "enabled": False,
            "system_prompt": "You are a data processing expert for AI. Guide NeMo Curator, data cleaning, deduplication (MinHash, SimHash), quality filtering, PII removal, and dataset versioning. Cover data augmentation, synthetic data generation, and web scraping best practices. Ensure data compliance and reproducibility.",
        },
        {
            "id": "ai-optimization",
            "name": "Model Optimization",
            "description": "Quantization, pruning, distillation, Flash Attention",
            "icon": "code",
            "enabled": False,
            "system_prompt": "You are a model optimization expert. Guide quantization (GPTQ, AWQ, GGUF, FP8), pruning (structured/unstructured), knowledge distillation, and Flash Attention. Cover model compression, architecture search, and inference optimization. Provide benchmarks and trade-off analysis for accuracy vs speed.",
        },
        {
            "id": "ai-mlops",
            "name": "MLOps",
            "description": "Experiment tracking, CI/CD, model registry, monitoring",
            "icon": "code",
            "enabled": False,
            "system_prompt": "You are an MLOps expert. Guide experiment tracking (MLflow, W&B), CI/CD for ML, model registry, A/B testing, canary deployments, and monitoring. Cover data drift detection, model versioning, and reproducible pipelines. Provide production-ready architecture for ML systems.",
        },
    ],
}


def _load() -> dict[str, Any]:
    if not _PROFILE_FILE.exists():
        return DEFAULT_PROFILE.copy()
    try:
        with open(_PROFILE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Merge with defaults for missing keys
        merged = DEFAULT_PROFILE.copy()
        merged.update(data)
        if "skills" not in data:
            merged["skills"] = DEFAULT_PROFILE["skills"]
        else:
            # Merge skills: keep user's skills + add any new defaults
            existing_ids = {s["id"] for s in data["skills"]}
            for ds in DEFAULT_PROFILE["skills"]:
                if ds["id"] not in existing_ids:
                    data["skills"].append(ds)
            merged["skills"] = data["skills"]
        return merged
    except (json.JSONDecodeError, OSError):
        return DEFAULT_PROFILE.copy()


def _save(data: dict[str, Any]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(_PROFILE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_system_prompt_parts() -> list[str]:
    """Get active system prompt parts from enabled skills and custom instructions.
    Called by chat completion to inject personality into the AI."""
    profile = _load()
    parts = []

    # Custom instructions
    custom = profile.get("custom_instructions", "").strip()
    if custom:
        parts.append(f"## User Instructions\n{custom}")

    # Personality
    personality = profile.get("personality", {})
    tone = personality.get("tone", "friendly")
    lang = personality.get("language", "auto")
    verbosity = personality.get("verbosity", "balanced")
    expertise = personality.get("expertise_level", "intermediate")

    personality_text = f"Adapt your tone to be {tone}"
    if lang != "auto":
        personality_text += f". Respond in {lang}"
    personality_text += f". Keep responses {verbosity}"
    if expertise:
        personality_text += f". The user is at {expertise} level"
    parts.append(f"## Personality\n{personality_text}")

    # Enabled skills
    enabled_skills = [s for s in profile.get("skills", []) if s.get("enabled")]
    for skill in enabled_skills:
        sp = skill.get("system_prompt", "")
        if sp:
            parts.append(sp)

    return parts


# ── API Routes ───────────────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    avatar_emoji: str | None = None


class UpdatePersonalityRequest(BaseModel):
    tone: str | None = None
    language: str | None = None
    verbosity: str | None = None
    expertise_level: str | None = None


class UpdateInstructionsRequest(BaseModel):
    custom_instructions: str


class ToggleSkillRequest(BaseModel):
    enabled: bool


class AddSkillRequest(BaseModel):
    id: str
    name: str
    description: str = ""
    icon: str = "🧩"
    system_prompt: str = ""


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/profile", tags=["profile"])

    @router.get("")
    def get_profile(authorization: str | None = Header(default=None)):
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        return _load()

    @router.put("")
    def update_profile(body: UpdateProfileRequest, authorization: str | None = Header(default=None)):
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        profile = _load()
        if body.display_name is not None:
            profile["display_name"] = body.display_name
        if body.avatar_emoji is not None:
            profile["avatar_emoji"] = body.avatar_emoji
        _save(profile)
        return {"ok": True, "profile": profile}

    @router.put("/personality")
    def update_personality(body: UpdatePersonalityRequest, authorization: str | None = Header(default=None)):
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        profile = _load()
        personality = profile.get("personality", {})
        if body.tone is not None:
            personality["tone"] = body.tone
        if body.language is not None:
            personality["language"] = body.language
        if body.verbosity is not None:
            personality["verbosity"] = body.verbosity
        if body.expertise_level is not None:
            personality["expertise_level"] = body.expertise_level
        profile["personality"] = personality
        _save(profile)
        return {"ok": True, "personality": personality}

    @router.put("/instructions")
    def update_instructions(body: UpdateInstructionsRequest, authorization: str | None = Header(default=None)):
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        profile = _load()
        profile["custom_instructions"] = body.custom_instructions
        _save(profile)
        return {"ok": True}

    @router.get("/system-prompt")
    def get_system_prompt(authorization: str | None = Header(default=None)):
        """Get the combined system prompt from all active skills + custom instructions."""
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"system_prompt": ""}
        parts = get_system_prompt_parts()
        return {"system_prompt": "\n\n".join(parts), "parts": parts}

    @router.put("/skills/{skill_id}/toggle")
    def toggle_skill(skill_id: str, body: ToggleSkillRequest, authorization: str | None = Header(default=None)):
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        profile = _load()
        for skill in profile.get("skills", []):
            if skill["id"] == skill_id:
                skill["enabled"] = body.enabled
                _save(profile)
                return {"ok": True, "skill": skill}
        return {"error": "Skill not found"}

    @router.post("/skills")
    def add_skill(body: AddSkillRequest, authorization: str | None = Header(default=None)):
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        profile = _load()
        skills = profile.get("skills", [])
        # Check duplicate
        if any(s["id"] == body.id for s in skills):
            return {"error": "Skill already exists"}
        new_skill = {
            "id": body.id,
            "name": body.name,
            "description": body.description,
            "icon": body.icon,
            "enabled": True,
            "system_prompt": body.system_prompt,
        }
        skills.append(new_skill)
        profile["skills"] = skills
        _save(profile)
        return {"ok": True, "skill": new_skill}

    @router.delete("/skills/{skill_id}")
    def delete_skill(skill_id: str, authorization: str | None = Header(default=None)):
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        profile = _load()
        skills = profile.get("skills", [])
        profile["skills"] = [s for s in skills if s["id"] != skill_id]
        _save(profile)
        return {"ok": True}

    return router
