"""Jezweb Claude Skills — from jezweb/claude-skills.
52 production workflow skills across 11 plugins.
"""

JEZWEB_SKILLS = [
    # ── Cloudflare (8) ────────────────────────────────────────────────────────
    {
        "id": "jw-cloudflare-worker",
        "name": "Cloudflare Worker Builder",
        "description": "Scaffold and deploy Cloudflare Workers",
        "icon": "cloud",
        "enabled": False,
        "system_prompt": (
            "CLOUDFLARE WORKER BUILDER: When building Cloudflare Workers, scaffold a new project with wrangler.toml, "
            "TypeScript setup, and deployment config. Follow Workers best practices: stateless, edge-first, "
            "use D1/KV/R2 bindings when needed. Always include a test endpoint."
        ),
    },
    {
        "id": "jw-vite-flare",
        "name": "Vite Flare Starter",
        "description": "Scaffold full-stack Vite + Cloudflare apps",
        "icon": "rocket",
        "enabled": False,
        "system_prompt": (
            "VITE FLARE STARTER: Scaffold full-stack apps with Vite + React + Cloudflare Workers/Pages. "
            "Include: React Router, Tailwind CSS, TypeScript, wrangler config. Deploy to Cloudflare Pages."
        ),
    },
    {
        "id": "jw-tanstack-start",
        "name": "TanStack Start",
        "description": "Scaffold TanStack Start SSR dashboard",
        "icon": "layout",
        "enabled": False,
        "system_prompt": (
            "TANSTACK START: Build SSR dashboards with TanStack Start. Include TanStack Router, Query, Table. "
            "Configure for Cloudflare deployment. Use file-based routing and type-safe data loading."
        ),
    },
    {
        "id": "jw-hono-api",
        "name": "Hono API Scaffolder",
        "description": "Scaffold Hono API routes on Cloudflare",
        "icon": "code",
        "enabled": False,
        "system_prompt": (
            "HONO API SCAFFOLDER: Build REST APIs with Hono on Cloudflare Workers. Include: route grouping, "
            "middleware (auth, CORS, logging), OpenAPI docs, D1 database integration, error handling."
        ),
    },
    {
        "id": "jw-d1-drizzle",
        "name": "D1 Drizzle Schema",
        "description": "Generate Drizzle ORM schemas for Cloudflare D1",
        "icon": "database",
        "enabled": False,
        "system_prompt": (
            "D1 DRIZZLE SCHEMA: Generate Drizzle ORM schemas for Cloudflare D1. Include: table definitions, "
            "relations, indexes, migrations. Follow Drizzle best practices for type safety."
        ),
    },
    {
        "id": "jw-d1-migration",
        "name": "D1 Migration",
        "description": "Run D1 database migrations",
        "icon": "git-branch",
        "enabled": False,
        "system_prompt": (
            "D1 MIGRATION: Handle D1 database migrations with Drizzle Kit. Generate migration files, "
            "apply to remote/preview databases, verify schema consistency."
        ),
    },
    {
        "id": "jw-db-seed",
        "name": "DB Seed",
        "description": "Generate sample/demo database data",
        "icon": "database",
        "enabled": False,
        "system_prompt": (
            "DB SEED: Generate realistic sample data for development and demos. Use Faker.js for names, "
            "emails, dates. Create seed scripts that run idempotently. Include edge cases."
        ),
    },
    {
        "id": "jw-cloudflare-api",
        "name": "Cloudflare API",
        "description": "Bulk/fleet operations via Cloudflare API",
        "icon": "terminal",
        "enabled": False,
        "system_prompt": (
            "CLOUDFLARE API: Use Cloudflare API for bulk operations: DNS management, custom hostnames, "
            "email routing, zone settings. Write scripts with proper auth and error handling."
        ),
    },
    # ── Frontend (7) ──────────────────────────────────────────────────────────
    {
        "id": "jw-tailwind-theme",
        "name": "Tailwind Theme Builder",
        "description": "Tailwind v4 theming and configuration",
        "icon": "palette",
        "enabled": False,
        "system_prompt": (
            "TAILWIND THEME BUILDER: Configure Tailwind CSS v4 themes. Create custom color palettes, "
            "typography scales, spacing. Use CSS-first configuration. Include dark mode support."
        ),
    },
    {
        "id": "jw-shadcn-ui",
        "name": "shadcn/ui",
        "description": "Install and configure shadcn/ui components",
        "icon": "puzzle",
        "enabled": False,
        "system_prompt": (
            "SHADCN/UI: Install and configure shadcn/ui components. Follow the official recipe: "
            "npx shadcn@latest init, then add components as needed. Customize theme to match brand."
        ),
    },
    {
        "id": "jw-landing-page",
        "name": "Landing Page",
        "description": "Build professional marketing/landing pages",
        "icon": "layout",
        "enabled": False,
        "system_prompt": (
            "LANDING PAGE: Build professional landing pages with: hero section, features, testimonials, "
            "CTA, footer. Use Tailwind CSS, responsive design, animations. Include SEO meta tags."
        ),
    },
    {
        "id": "jw-product-showcase",
        "name": "Product Showcase",
        "description": "Build product showcase/portfolio sites",
        "icon": "monitor",
        "enabled": False,
        "system_prompt": (
            "PRODUCT SHOWCASE: Build product showcase sites with: gallery, pricing, features comparison, "
            "demo embeds. Responsive design, smooth animations, professional typography."
        ),
    },
    {
        "id": "jw-react-patterns",
        "name": "React Patterns",
        "description": "React 19 performance and composition patterns",
        "icon": "code",
        "enabled": False,
        "system_prompt": (
            "REACT PATTERNS: Apply React 19 patterns: Server Components, use() hook, Actions, "
            "useOptimistic, useTransition. Minimize re-renders, use proper memoization."
        ),
    },
    {
        "id": "jw-design-review",
        "name": "Design Review",
        "description": "Visual design quality review",
        "icon": "eye",
        "enabled": False,
        "system_prompt": (
            "DESIGN REVIEW: Review UI designs for: visual hierarchy, spacing consistency, color contrast, "
            "typography, alignment, whitespace. Reference Material Design, Apple HIG, or industry standards."
        ),
    },
    {
        "id": "jw-react-native",
        "name": "React Native",
        "description": "React Native + Expo mobile app patterns",
        "icon": "smartphone",
        "enabled": False,
        "system_prompt": (
            "REACT NATIVE: Build React Native apps with Expo. Include: navigation (React Navigation), "
            "state management, API integration, push notifications, App Store/Play Store deployment."
        ),
    },
    # ── Design Assets (5) ─────────────────────────────────────────────────────
    {
        "id": "jw-color-palette",
        "name": "Color Palette",
        "description": "Generate accessible color palettes from hex",
        "icon": "palette",
        "enabled": False,
        "system_prompt": (
            "COLOR PALETTE: Generate accessible color palettes from a single hex color. Include: "
            "primary, secondary, accent, neutral shades. Check WCAG contrast ratios. Generate CSS variables."
        ),
    },
    {
        "id": "jw-favicon-gen",
        "name": "Favicon Generator",
        "description": "Generate favicon packages for all platforms",
        "icon": "image",
        "enabled": False,
        "system_prompt": (
            "FAVICON GENERATOR: Generate complete favicon packages: ICO, PNG (16-512px), SVG, "
            "Apple Touch Icon, Android Chrome, manifest.json. Include proper HTML tags."
        ),
    },
    {
        "id": "jw-icon-set",
        "name": "Icon Set Generator",
        "description": "Generate custom SVG icon sets",
        "icon": "sparkles",
        "enabled": False,
        "system_prompt": (
            "ICON SET GENERATOR: Generate custom SVG icon sets with consistent style, stroke width, "
            "and viewBox. Export as individual SVGs, sprite sheet, or React components."
        ),
    },
    {
        "id": "jw-image-processing",
        "name": "Image Processing",
        "description": "Resize, convert, optimize images",
        "icon": "image",
        "enabled": False,
        "system_prompt": (
            "IMAGE PROCESSING: Resize, convert (WebP/AVIF), optimize images. Use Sharp.js or CLI tools. "
            "Generate responsive image sets with srcset. Include lazy loading."
        ),
    },
    {
        "id": "jw-ai-image-gen",
        "name": "AI Image Generator",
        "description": "Generate images with Gemini/GPT AI models",
        "icon": "sparkles",
        "enabled": False,
        "system_prompt": (
            "AI IMAGE GENERATOR: Generate images using AI models (Gemini, GPT). Create detailed prompts, "
            "handle API calls, process and save results. Include retry logic and error handling."
        ),
    },
    # ── Writing (8) ───────────────────────────────────────────────────────────
    {
        "id": "jw-aussie-english",
        "name": "Aussie Business English",
        "description": "Australian English business writing style",
        "icon": "globe",
        "enabled": False,
        "system_prompt": (
            "AUSSIE BUSINESS ENGLISH: Write in Australian English business style. Use: "
            "Australian spelling (colour, organisation), formal but friendly tone, "
            "local business conventions, AUD references."
        ),
    },
    {
        "id": "jw-us-english",
        "name": "US Business English",
        "description": "American English business writing style",
        "icon": "globe",
        "enabled": False,
        "system_prompt": (
            "US BUSINESS ENGLISH: Write in American English business style. Use: "
            "American spelling (color, organization), professional tone, "
            "US business conventions, USD references."
        ),
    },
    {
        "id": "jw-uk-english",
        "name": "UK Business English",
        "description": "British English business writing style",
        "icon": "globe",
        "enabled": False,
        "system_prompt": (
            "UK BUSINESS ENGLISH: Write in British English business style. Use: "
            "British spelling (colour, organisation), formal professional tone, "
            "UK business conventions, GBP references."
        ),
    },
    {
        "id": "jw-nz-english",
        "name": "NZ Business English",
        "description": "New Zealand English business writing style",
        "icon": "globe",
        "enabled": False,
        "system_prompt": (
            "NZ BUSINESS ENGLISH: Write in New Zealand English business style. Use: "
            "NZ spelling, friendly professional tone, local conventions, NZD references."
        ),
    },
    {
        "id": "jw-resume",
        "name": "Resume & Cover Letter",
        "description": "Write professional resumes and cover letters",
        "icon": "file-text",
        "enabled": False,
        "system_prompt": (
            "RESUME & COVER LETTER: Write professional resumes and cover letters. Include: "
            "clear structure, achievement-focused bullet points, quantified results, "
            "tailored to job description. ATS-friendly format."
        ),
    },
    {
        "id": "jw-proposal",
        "name": "Proposal Writer",
        "description": "Write client proposals and quotes",
        "icon": "file-text",
        "enabled": False,
        "system_prompt": (
            "PROPOSAL WRITER: Write professional client proposals with: executive summary, "
            "scope of work, timeline, pricing, terms, case studies. Clear, persuasive language."
        ),
    },
    {
        "id": "jw-award-app",
        "name": "Award Application",
        "description": "Write award submissions and grant applications",
        "icon": "award",
        "enabled": False,
        "system_prompt": (
            "AWARD APPLICATION: Write compelling award submissions and grant applications. "
            "Structure: problem statement, solution, impact, metrics, evidence. Follow submission guidelines."
        ),
    },
    {
        "id": "jw-strategy-doc",
        "name": "Strategy Document",
        "description": "Write SWOT analysis, business plans, OKRs",
        "icon": "file-text",
        "enabled": False,
        "system_prompt": (
            "STRATEGY DOCUMENT: Write SWOT analyses, business plans, OKR frameworks. "
            "Include: market analysis, competitive landscape, strategic initiatives, KPIs, timelines."
        ),
    },
    # ── Social Media (1) ──────────────────────────────────────────────────────
    {
        "id": "jw-social-media",
        "name": "Social Media Posts",
        "description": "Platform-formatted posts for LinkedIn, Facebook, Instagram, Reddit",
        "icon": "message-square",
        "enabled": False,
        "system_prompt": (
            "SOCIAL MEDIA POSTS: Create platform-optimized posts. LinkedIn (professional, 1300 char), "
            "Facebook (engaging, 63203 char), Instagram (visual, 2200 char + hashtags), "
            "Reddit (authentic, community-focused). Include hashtag strategies."
        ),
    },
    # ── Dev Tools (11) ────────────────────────────────────────────────────────
    {
        "id": "jw-project-health",
        "name": "Project Health",
        "description": "Audit project config, permissions, dependencies",
        "icon": "activity",
        "enabled": False,
        "system_prompt": (
            "PROJECT HEALTH: Audit project health: dependency versions, security vulnerabilities, "
            "config consistency, permission issues, unused files, build status. Generate health report."
        ),
    },
    {
        "id": "jw-project-docs",
        "name": "Project Docs",
        "description": "Generate project documentation and architecture docs",
        "icon": "book-open",
        "enabled": False,
        "system_prompt": (
            "PROJECT DOCS: Generate comprehensive project documentation: architecture overview, "
            "API docs, setup guide, contributing guide, changelog. Use Markdown with diagrams."
        ),
    },
    {
        "id": "jw-app-docs",
        "name": "App Docs",
        "description": "Generate user guides and app documentation",
        "icon": "book-open",
        "enabled": False,
        "system_prompt": (
            "APP DOCS: Generate user-facing app documentation: user guide, feature explanations, "
            "FAQ, troubleshooting. Clear, non-technical language. Include screenshots placeholders."
        ),
    },
    {
        "id": "jw-team-update",
        "name": "Team Update",
        "description": "Generate team status updates and reports",
        "icon": "users",
        "enabled": False,
        "system_prompt": (
            "TEAM UPDATE: Generate team status updates: what was done, what's in progress, "
            "blockers, next steps. Concise, actionable format for chat/Slack/email."
        ),
    },
    {
        "id": "jw-github-release",
        "name": "GitHub Release",
        "description": "Create GitHub releases with changelogs",
        "icon": "git-branch",
        "enabled": False,
        "system_prompt": (
            "GITHUB RELEASE: Create GitHub releases with: version bump, changelog from commits, "
            "breaking changes highlighted, migration guide if needed. Follow semver."
        ),
    },
    {
        "id": "jw-git-workflow",
        "name": "Git Workflow",
        "description": "Prepare PRs, clean branches, manage workflow",
        "icon": "git-merge",
        "enabled": False,
        "system_prompt": (
            "GIT WORKFLOW: Manage git workflow: feature branches, clean stale branches, "
            "prepare PRs with good descriptions, squash commits, handle merge conflicts."
        ),
    },
    {
        "id": "jw-ux-audit",
        "name": "UX Audit",
        "description": "Dogfood the app and audit UX patterns",
        "icon": "eye",
        "enabled": False,
        "system_prompt": (
            "UX AUDIT: Dogfood the app and audit UX: navigation flow, task completion, "
            "error states, loading states, empty states, accessibility. Reference Nielsen's heuristics."
        ),
    },
    {
        "id": "jw-responsiveness",
        "name": "Responsiveness Check",
        "description": "Test UI across viewports and devices",
        "icon": "smartphone",
        "enabled": False,
        "system_prompt": (
            "RESPONSIVENESS CHECK: Test UI across viewports: mobile (375px), tablet (768px), "
            "desktop (1440px). Check: overflow, text truncation, touch targets, layout breaks."
        ),
    },
    {
        "id": "jw-deep-research",
        "name": "Deep Research",
        "description": "Deep research and exploration of a topic",
        "icon": "search",
        "enabled": False,
        "system_prompt": (
            "DEEP RESEARCH: Conduct deep research: search multiple sources, cross-reference, "
            "identify patterns, evaluate credibility. Present findings with citations and confidence levels."
        ),
    },
    {
        "id": "jw-onboarding-ux",
        "name": "Onboarding UX",
        "description": "Design onboarding flows and empty states",
        "icon": "user-plus",
        "enabled": False,
        "system_prompt": (
            "ONBOARDING UX: Design onboarding: welcome screens, progressive disclosure, "
            "empty states with CTAs, tooltips, first-time user experience. Reduce cognitive load."
        ),
    },
    {
        "id": "jw-roadmap",
        "name": "Roadmap",
        "description": "Create phased delivery roadmaps",
        "icon": "list",
        "enabled": False,
        "system_prompt": (
            "ROADMAP: Create phased delivery roadmaps: MVP → V1 → V2. Include: milestones, "
            "dependencies, risk assessment, resource allocation, success metrics."
        ),
    },
    # ── Integrations (9) ──────────────────────────────────────────────────────
    {
        "id": "jw-stripe-payments",
        "name": "Stripe Payments",
        "description": "Integrate Stripe checkout, subscriptions, webhooks",
        "icon": "credit-card",
        "enabled": False,
        "system_prompt": (
            "STRIPE PAYMENTS: Integrate Stripe: checkout sessions, subscriptions, webhooks, "
            "billing portal. Handle: payment intent, invoice, customer management. Include error handling."
        ),
    },
    {
        "id": "jw-google-workspace",
        "name": "Google Workspace",
        "description": "Setup Google Workspace API integrations",
        "icon": "globe",
        "enabled": False,
        "system_prompt": (
            "GOOGLE WORKSPACE: Setup Google Workspace APIs: Gmail, Calendar, Drive, Sheets. "
            "OAuth2 flow, service accounts, API quotas. Include rate limiting."
        ),
    },
    {
        "id": "jw-google-chat",
        "name": "Google Chat Messages",
        "description": "Send messages via Google Chat webhooks",
        "icon": "message-square",
        "enabled": False,
        "system_prompt": (
            "GOOGLE CHAT: Send messages via Google Chat webhooks. Format cards with: "
            "headers, sections, buttons. Handle errors and retries."
        ),
    },
    {
        "id": "jw-apps-script",
        "name": "Google Apps Script",
        "description": "Automate Google Sheets with Apps Script",
        "icon": "terminal",
        "enabled": False,
        "system_prompt": (
            "GOOGLE APPS SCRIPT: Write Google Apps Script for Sheets automation. "
            "Include: triggers, custom functions, menus, dialogs. Handle quota limits."
        ),
    },
    {
        "id": "jw-elevenlabs",
        "name": "ElevenLabs Agents",
        "description": "Build voice agents with ElevenLabs",
        "icon": "mic",
        "enabled": False,
        "system_prompt": (
            "ELEVENLABS AGENTS: Build voice agents with ElevenLabs API. "
            "Include: text-to-speech, voice cloning, agent configuration, WebSocket streaming."
        ),
    },
    {
        "id": "jw-mcp-builder",
        "name": "MCP Builder",
        "description": "Build MCP servers with FastMCP",
        "icon": "server",
        "enabled": False,
        "system_prompt": (
            "MCP BUILDER: Build Model Context Protocol servers with FastMCP. "
            "Include: tools, resources, prompts. Deploy as stdio or SSE transport."
        ),
    },
    {
        "id": "jw-shopify-setup",
        "name": "Shopify Setup",
        "description": "Setup Shopify API and admin integrations",
        "icon": "shopping-cart",
        "enabled": False,
        "system_prompt": (
            "SHOPIFY SETUP: Setup Shopify API: OAuth flow, Admin API, Storefront API. "
            "Include: webhooks, product management, order handling."
        ),
    },
    {
        "id": "jw-shopify-products",
        "name": "Shopify Products",
        "description": "Create Shopify products (single + bulk CSV)",
        "icon": "package",
        "enabled": False,
        "system_prompt": (
            "SHOPIFY PRODUCTS: Create products via Shopify API: single product creation, "
            "bulk CSV import, variants, images, collections. Include validation."
        ),
    },
    {
        "id": "jw-wordpress",
        "name": "WordPress Setup",
        "description": "Setup WordPress API and WP-CLI access",
        "icon": "globe",
        "enabled": False,
        "system_prompt": (
            "WORDPRESS SETUP: Setup WordPress: REST API access, WP-CLI, "
            "authentication (Application Passwords), content management, plugin development."
        ),
    },
]
