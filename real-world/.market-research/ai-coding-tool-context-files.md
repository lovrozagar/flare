last updated: 2026-03-06

# AI Coding Tool Context Files: Comprehensive Research

## Executive Summary

- Every major AI coding tool now supports project-level instruction files -- the ecosystem is converging fast
- AGENTS.md is emerging as the cross-tool standard (Linux Foundation stewardship, 60k+ repos), but tool-specific files still dominate in practice
- Next.js is the first major framework to ship version-matched docs inside node_modules AND auto-generate AGENTS.md + CLAUDE.md via create-next-app (since v16.2.0-canary.37)
- Vercel launched `skills` (npx skills add) as an npm-like package manager for agent context -- early but significant
- All tools are converging on: markdown format, frontmatter for scoping, directory-based organization, glob patterns for conditional loading

---

## 1. Cursor

### File Paths
| File | Status | Purpose |
|------|--------|---------|
| `.cursorrules` | **Deprecated** (still works) | Legacy single-file project rules |
| `.cursor/rules/*.mdc` | **Current** | Modular, scoped project rules |
| User-level rules | Via Settings > Rules for AI | Personal rules across projects |

### Format: MDC (Modular Document Content)
```yaml
---
description: Short description of the rule's purpose
globs: src/**/*.ts
alwaysApply: false
---

# Rule content in markdown
```

### Frontmatter Behavior Matrix
| Configuration | Behavior |
|--------------|----------|
| `alwaysApply: true` | Always included, glob ignored |
| `globs` only (no description) | Auto-attached when matching files are open |
| `description` only | Agent can discover and use, not auto-attached |
| `description` + `globs` | Agent-discoverable AND auto-attaches on file match |
| `description` + `alwaysApply: true` | Always included, visible in agent/composer |

### Size Limits
- No hard documented character/token limit per .mdc file
- Practical guidance: minimize tokens per rule, split large rules into scoped files
- Every rule loaded costs tokens from context window -- scope aggressively with globs

### Loading Priority
1. User-level rules (Settings > Rules for AI)
2. `.cursor/rules/*.mdc` files (by frontmatter matching)
3. Legacy `.cursorrules` (if no .cursor/rules/ exists)

### Sources
- https://cursor.com/docs/context/rules
- https://forum.cursor.com/t/my-best-practices-for-mdc-rules-and-troubleshooting/50526
- https://github.com/PatrickJS/awesome-cursorrules

---

## 2. Claude Code

### File Paths
| File | Scope | Loaded |
|------|-------|--------|
| `/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS) or `/etc/claude-code/CLAUDE.md` (Linux) | Managed policy (org-wide) | Always, cannot be excluded |
| `~/.claude/CLAUDE.md` | User (all projects) | Every session |
| `~/.claude/rules/*.md` | User rules | Every session (before project rules) |
| `./CLAUDE.md` or `./.claude/CLAUDE.md` | Project | Every session |
| `./CLAUDE.local.md` | Local (gitignored) | Every session |
| `./.claude/rules/*.md` | Project rules | Every session (unconditional) or on file match (with `paths` frontmatter) |
| Subdirectory `CLAUDE.md` | Subdirectory | On-demand when Claude reads files in that directory |

### Auto Memory (separate system)
| File | Purpose |
|------|---------|
| `~/.claude/projects/<project>/memory/MEMORY.md` | Auto-saved learnings (first 200 lines loaded) |
| `~/.claude/projects/<project>/memory/*.md` | Topic files (loaded on-demand) |

### Format: Plain Markdown
```markdown
---
paths:
  - "src/api/**/*.ts"
---

# Rule content here
```

- Path-specific rules use YAML frontmatter with `paths` field (glob patterns)
- Rules without `paths` frontmatter load unconditionally
- `@path/to/file` import syntax for pulling in external files (max 5 hops deep)
- Both relative and absolute paths supported in imports

### Size Limits
- Target under **200 lines** per CLAUDE.md file (practical guidance, not hard limit)
- CLAUDE.md files loaded **in full** regardless of length
- MEMORY.md: first **200 lines** loaded at session start, rest available on-demand

### Loading Order (highest to lowest priority)
1. Managed policy CLAUDE.md (cannot be excluded)
2. Project `.claude/rules/*.md` (path-matched or unconditional)
3. Project `./CLAUDE.md` or `./.claude/CLAUDE.md`
4. `./CLAUDE.local.md`
5. User `~/.claude/rules/*.md`
6. User `~/.claude/CLAUDE.md`
7. Auto memory `MEMORY.md` (first 200 lines)
8. Subdirectory CLAUDE.md files (lazy-loaded)

### Key Features
- `/init` command auto-generates CLAUDE.md from codebase analysis
- `/memory` command to browse all loaded instruction files
- `claudeMdExcludes` setting to skip irrelevant CLAUDE.md in monorepos
- Symlinks supported in `.claude/rules/`
- Survives `/compact` (re-read from disk)

### Sources
- https://code.claude.com/docs/en/memory
- https://claude.com/blog/using-claude-md-files
- https://claudefa.st/blog/guide/mechanics/rules-directory

---

## 3. Windsurf (Codeium)

### File Paths
| File | Status | Scope |
|------|--------|-------|
| `.windsurfrules` | **Legacy** | Workspace rules (single file) |
| `.windsurf/rules/*.md` | **Current** | Workspace rules (directory) |
| `global_rules.md` | Current | Global rules (all workspaces) |
| `/Library/Application Support/Windsurf/rules/*.md` (macOS) | Enterprise | System-level rules |
| `/etc/windsurf/rules/*.md` (Linux/WSL) | Enterprise | System-level rules |

### Rule Activation Modes
| Mode | Behavior |
|------|----------|
| **Always On** | Rule consistently applies to all conversations |
| **Manual** | Activated via @mention only |
| **Model Decision** | AI decides based on natural language description |
| **Glob** | Applied to files matching pattern (e.g., `*.js`, `src/**/*.ts`) |

### Format: Markdown
- Plain `.md` files in `.windsurf/rules/`
- Best practices: bullet points, numbered lists, XML tags for grouping

### Size Limits
- **12,000 characters** per rule file (hard limit)

### Discovery
- Auto-discovers from current workspace, subdirectories, and parent directories up to git root
- System-level rules merged with workspace and global rules (not overridden)

### Sources
- https://docs.windsurf.com/windsurf/cascade/memories
- https://dev.to/yardenporat/codium-windsurf-ide-rules-file-1hn9
- https://windsurf.com/editor/directory

---

## 4. GitHub Copilot (VS Code)

### File Paths
| File | Scope | Loaded |
|------|-------|--------|
| `.github/copilot-instructions.md` | Repository-wide | Always (all chat requests) |
| `.github/instructions/*.instructions.md` | Path-specific | When files match `applyTo` glob |
| `AGENTS.md` | Repository-wide | Always (experimental, toggleable) |
| `CLAUDE.md` | Repository-wide | Always (toggleable) |
| `.claude/rules/*.md` | Path-specific | Claude compatibility |
| Organization `.github` repo instructions | Org-wide | Always |

### Format: Markdown with Optional YAML Frontmatter
```yaml
---
name: 'TypeScript Standards'
description: 'Rules for TypeScript files'
applyTo: '**/*.ts,**/*.tsx'
---

# Instruction content
```

- `applyTo`: glob pattern for conditional loading
- `name`: display name in UI
- `description`: hover text
- `excludeAgent`: exclude from specific agents (e.g., `"code-review"`, `"coding-agent"`)

### Prompt Files
- `.github/prompts/*.prompt.md` -- reusable prompt templates
- `/init` slash command auto-generates instructions from workspace analysis
- `/create-instruction` generates targeted instruction files

### Priority Order
1. Personal instructions (user-level) -- highest
2. Repository instructions (`.github/copilot-instructions.md` or `AGENTS.md`)
3. Organization instructions -- lowest

### Size Limits
- Auto-generated files: max 2 pages
- No explicit character limit documented for manually created files

### Key VS Code Settings
- `chat.useAgentsMdFile` -- enable AGENTS.md
- `chat.useClaudeMdFile` -- enable CLAUDE.md
- `chat.includeApplyingInstructions` -- enable pattern-based instructions

### Sources
- https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot
- https://code.visualstudio.com/docs/copilot/customization/custom-instructions
- https://learn.microsoft.com/en-us/visualstudio/ide/copilot-chat-context

---

## 5. Cline

### File Paths
| File | Scope |
|------|-------|
| `.clinerules` | Legacy single file (root) |
| `.clinerules/*.md` or `.clinerules/*.txt` | Workspace rules directory |
| `~/Documents/Cline/Rules/` (macOS/Linux) | Global rules |
| `Documents\Cline\Rules` (Windows) | Global rules |

### Cross-Tool Compatibility
Cline also reads:
- `.cursorrules`
- `.windsurfrules`
- `AGENTS.md`

### Format: Markdown or Plain Text
- `.md` and `.txt` files supported
- Optional YAML frontmatter for conditional rules:
```yaml
---
paths:
  - "src/components/**"
  - "src/hooks/**"
---
```
- Numeric prefixes optional for ordering (e.g., `01-coding.md`)

### Toggle Mechanism (v3.13+)
- Dedicated popover UI in chat interface
- Individual toggle per rule file
- Enable/disable without deleting files

### Size Limits
- No explicit limit documented
- Guidance: keep rules concise, avoid pasting entire style guides (token cost)

### Loading
- All `.md` and `.txt` files in `.clinerules/` combined into unified ruleset
- Workspace rules take precedence over global rules during conflicts
- Conditional rules evaluate against open tabs, mentioned files, visible files, edited files
- AI can read, write, and edit rule files (self-improving rules)

### Sources
- https://docs.cline.bot/features/cline-rules
- https://cline.bot/blog/clinerules-version-controlled-shareable-and-ai-editable-instructions

---

## 6. Continue.dev

### File Paths
| File | Scope |
|------|-------|
| `.continue/rules/*.md` | Workspace rules |
| `~/.continue/rules/*.md` | User rules (all projects) |
| `config.yaml` (rules section) | Configuration-driven rules |

### Format
- Markdown files in `.continue/rules/`
- Can import from Continue Hub: `uses: hub-rules/typescript`
- Supports `${{ secrets.SECRET_NAME }}` for env vars in `.continue/.env`

### Rule Scoping
- Global rules: applied across all workspaces
- Workspace rules: project-specific (e.g., "TypeScript rules for web apps")

### Sources
- https://docs.continue.dev/guides/configuring-models-rules-tools
- https://docs.continue.dev/customize/deep-dives/configuration

---

## 7. v0 by Vercel / AGENTS.md Standard / Skills

### AGENTS.md (Cross-Tool Standard)
| Aspect | Detail |
|--------|--------|
| **Format** | Plain Markdown, no required fields |
| **Location** | Project root (supports nested in subdirectories) |
| **Steward** | Agentic AI Foundation (Linux Foundation) |
| **Contributors** | OpenAI, Google, Cursor, Amp, Factory |
| **Adoption** | 60,000+ open-source repos |
| **Supported by** | Codex, Copilot, Gemini, Claude, Cursor, Zed, Aider, Cline, Roo Code, Junie, and many more |

### Vercel Skills Ecosystem
- CLI: `npx skills add <owner/repo>` (current version: 1.4.3)
- Installs into `.skills/` directory
- Two scope types: project (committed) or global
- Install by symlink (recommended) or copy
- No special publish command -- just put in a git repo
- Public registry at skills.sh (auto-indexed via install telemetry)

### v0-Specific Context
- v0 uses internal system prompts for shadcn/ui, lucide-react, Tailwind, AI SDK
- Project Rules and Custom Instructions available in v0 UI
- No file-based project rules (UI-only for v0 itself)

### Sources
- https://agents.md/
- https://vercel.com/blog/agent-skills-explained-an-faq
- https://vercel.com/kb/guide/agent-skills-creating-installing-and-sharing-reusable-agent-context
- https://github.com/vercel-labs/agent-skills

---

## 8. Bolt.new (StackBlitz)

### Context Mechanism: UI-Based Only
- **Project Knowledge**: gear icon > All project settings > Knowledge
- **Personal Settings knowledge**: applies to all projects (higher priority than project knowledge)
- **No file-based configuration** -- all through web UI
- `.bolt/prompt` exists in some starter templates (undocumented internal use)

### Priority
- Personal Settings > Project Knowledge

### Sources
- https://support.bolt.new/building/using-bolt/project-settings
- https://github.com/stackblitz/bolt.new

---

## 9. Lovable

### Context Mechanism: UI-Based Only
- **Custom Knowledge**: Settings icon > Manage Knowledge
- Supports: project guidelines, user personas, design assets, coding conventions, external references, security practices, compliance requirements
- **No file-based configuration** -- all through web dashboard
- No documented size limits

### Sources
- https://docs.lovable.dev/features/knowledge

---

## 10. Additional Tools

### OpenAI Codex
| File | Scope |
|------|-------|
| `~/.codex/AGENTS.md` | Global |
| `~/.codex/AGENTS.override.md` | Global (higher priority) |
| `AGENTS.md` per directory | Project (root down to cwd) |
| `AGENTS.override.md` per directory | Project override |

- **Size limit**: 32 KiB default (`project_doc_max_bytes` configurable)
- Concatenates root-to-cwd, later files override earlier
- At most one file per directory
- Supports `project_doc_fallback_filenames` for alternate names

### Google Gemini CLI
| File | Scope |
|------|-------|
| `~/.gemini/GEMINI.md` | Global |
| `GEMINI.md` in workspace/parents | Project |
| Just-in-time `GEMINI.md` | Component (loaded when tools access directory) |

- `@file.md` import syntax (relative and absolute paths)
- Configurable filename via `settings.json`: `context.fileName: ["AGENTS.md", "GEMINI.md"]`
- `/memory show`, `/memory refresh`, `/memory add` commands
- No explicit size limits documented

### JetBrains Junie
| File | Priority |
|------|----------|
| `.junie/AGENTS.md` | Highest |
| `AGENTS.md` (root) | Second |
| `.junie/guidelines.md` or `.junie/guidelines/` | Legacy (still supported) |

### Zed Editor
Reads the **first matching file** from this list (stops after first match):
1. `.rules`
2. `.cursorrules`
3. `.windsurfrules`
4. `.clinerules`
5. `.github/copilot-instructions.md`
6. `AGENT.md`
7. `AGENTS.md`
8. `CLAUDE.md`
9. `GEMINI.md`

Plus user Rules Library (stored locally, @-mentionable).

### Roo Code
| File | Scope |
|------|-------|
| `.roo/rules/*.md` or `.roo/rules/*.txt` | Workspace |
| `AGENTS.md` or `AGENT.md` (root) | Workspace (auto-loaded) |
| Global rules via settings | User-wide |

- Files loaded recursively, alphabetical order by filename
- Appended to system prompt

### Augment Code
| File | Scope |
|------|-------|
| `~/.augment/rules/*.md` or `*.mdx` | User (always type only) |
| `<workspace>/.augment/rules/*.md` or `*.mdx` | Workspace (always/manual/auto) |
| Also reads `AGENTS.md`, `CLAUDE.md` hierarchically | Cross-tool compat |

- **Size limits**: User guidelines max 24,576 chars; Workspace guidelines+rules max 49,512 chars
- Priority when limits exceeded: manual > always/auto > legacy `.augment-guidelines`

### Amazon Q Developer
| File | Scope |
|------|-------|
| `.amazonq/rules/*.md` | Project |

- Markdown format, no documented frontmatter requirements
- Auto-detected and dynamically updated during session
- Resource config: `"file://.amazonq/rules/**/*.md"`

### Aider
| File | Scope |
|------|-------|
| `CONVENTIONS.md` | Project (via `--read` flag or `.aider.conf.yml`) |
| `AGENTS.md` | Project (configurable as default conventions) |

- Loaded via `.aider.conf.yml`: `read: [CONVENTIONS.md, AGENTS.md]`
- Read-only mode, prompt-cached for efficiency

---

## Cross-Tool Compatibility Matrix

| Tool | Own Format | AGENTS.md | CLAUDE.md | .cursorrules | .windsurfrules | .clinerules |
|------|-----------|-----------|-----------|-------------|---------------|------------|
| Cursor | `.cursor/rules/*.mdc` | Planned | No | Yes (deprecated) | No | No |
| Claude Code | `.claude/rules/*.md` | No (separate) | Yes | No | No | No |
| Windsurf | `.windsurf/rules/*.md` | No | No | No | Yes (deprecated) | No |
| GitHub Copilot | `.github/instructions/*.instructions.md` | Yes | Yes | No | No | No |
| Cline | `.clinerules/*.md` | Yes | No | Yes | Yes | Yes |
| Zed | `.rules` | Yes | Yes | Yes | Yes | Yes |
| Roo Code | `.roo/rules/*.md` | Yes | No | No | No | No |
| Augment | `.augment/rules/*.md` | Yes | Yes | No | No | No |
| Codex | N/A | Yes (native) | No | No | No | No |
| Gemini CLI | `GEMINI.md` | Yes (configurable) | No | No | No | No |
| Junie | `.junie/guidelines.md` | Yes | No | No | No | No |
| Continue | `.continue/rules/*.md` | No | No | No | No | No |
| Amazon Q | `.amazonq/rules/*.md` | No | No | No | No | No |

---

## Frameworks Shipping AI Context Files

### Next.js (Pioneer -- the only major framework doing this)

**Since**: v16.2.0-canary.37 (early 2026)

**What ships**:
- `node_modules/next/dist/docs/` -- full version-matched documentation tree
- `create-next-app` auto-generates `AGENTS.md` and `CLAUDE.md` at project root
- `--no-agents-md` flag to opt out

**AGENTS.md content** (auto-generated):
```markdown
<!-- BEGIN:nextjs-agent-rules -->
# Next.js: ALWAYS read docs before coding
Before any Next.js work, find and read the relevant doc in
`node_modules/next/dist/docs/`. Your training data is outdated --
the docs are the source of truth.
<!-- END:nextjs-agent-rules -->
```

**CLAUDE.md content** (auto-generated):
```markdown
@AGENTS.md
```

**Comment markers** (`BEGIN:nextjs-agent-rules` / `END:nextjs-agent-rules`) delimit framework-managed section. Users add custom instructions outside these markers.

**Benchmark**: Next.js publishes eval results at nextjs.org/evals showing agent performance improvement with bundled docs.

### Other Frameworks: Not Yet

No evidence found of Angular, Svelte, Vue, Remix, Nuxt, or other major frameworks shipping AI context files in their npm packages as of March 2026. However:
- Community-maintained `.cursorrules` files exist for most frameworks (via cursor.directory)
- Vercel's `skills` ecosystem has `react-best-practices` and `web-design-guidelines` skills
- MakerKit ships LLM rules for Cursor and Windsurf with their React Native Supabase starter

---

## Emerging Standards & Trends

### AGENTS.md as Universal Standard
- Stewarded by Agentic AI Foundation (Linux Foundation) since November 2025
- Founded by OpenAI, Google, Cursor, Amp, Factory
- Supported by 15+ tools (see matrix above)
- Plain markdown, no required structure, nested directory support
- Most tools now read AGENTS.md alongside their native format

### Vercel Skills as "npm for Agent Context"
- `npx skills add <owner/repo>` -- installs into `.skills/` directory
- Registry at skills.sh (auto-indexed)
- Three official skills: react-best-practices, web-design-guidelines, vercel-deploy-claimable
- Distinction: AGENTS.md = passive (always loaded), Skills = active (loaded on demand)
- Version 1.4.3 as of March 2026

### Convergence Patterns
1. **Directory-based rules** replacing single files (all tools moving this way)
2. **Frontmatter with glob patterns** for conditional loading (Cursor, Claude Code, Copilot, Cline, Augment)
3. **Hierarchical loading** -- root to subdirectory, more specific overrides general
4. **Enterprise/managed policy** paths for org-wide deployment (Claude Code, Windsurf, Copilot)
5. **Cross-tool compatibility** -- tools reading each other's formats (Zed reads 9 formats, Cline reads 4)

### ETH Zurich Finding (Feb 2026)
Auto-generated context files reduced task success compared to providing nothing on some models. Agents became "too obedient" -- following rules that conflicted with task requirements. Manually curated, concise rules outperform comprehensive auto-generated ones.

---

## Size Limits Summary

| Tool | Limit | Unit |
|------|-------|------|
| Cursor | No hard limit | Practical: minimize tokens |
| Claude Code | 200 lines recommended | Per CLAUDE.md file |
| Windsurf | 12,000 characters | Per rule file |
| GitHub Copilot | 2 pages (auto-gen only) | Auto-generated files |
| Cline | No hard limit | Keep concise |
| Augment | 24,576 chars (user) / 49,512 chars (workspace) | Combined |
| Codex | 32 KiB default | Combined (configurable) |
| Gemini CLI | No documented limit | N/A |
| Bolt.new | No documented limit | UI text field |
| Lovable | No documented limit | UI text field |

---

## Sources

### Tool Documentation
- [Cursor Rules](https://cursor.com/docs/context/rules)
- [Claude Code Memory](https://code.claude.com/docs/en/memory)
- [Windsurf Memories](https://docs.windsurf.com/windsurf/cascade/memories)
- [GitHub Copilot Instructions](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot)
- [VS Code Copilot Custom Instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Cline Rules](https://docs.cline.bot/features/cline-rules)
- [Continue.dev Configuration](https://docs.continue.dev/guides/configuring-models-rules-tools)
- [Lovable Custom Knowledge](https://docs.lovable.dev/features/knowledge)
- [Bolt.new Project Settings](https://support.bolt.new/building/using-bolt/project-settings)
- [AGENTS.md Specification](https://agents.md/)
- [Vercel Agent Skills FAQ](https://vercel.com/blog/agent-skills-explained-an-faq)
- [Vercel Skills KB](https://vercel.com/kb/guide/agent-skills-creating-installing-and-sharing-reusable-agent-context)
- [OpenAI Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- [Gemini CLI GEMINI.md](https://geminicli.com/docs/cli/gemini-md/)
- [JetBrains Junie Guidelines](https://www.jetbrains.com/help/junie/customize-guidelines.html)
- [Zed AI Rules](https://zed.dev/docs/ai/rules)
- [Roo Code Custom Instructions](https://docs.roocode.com/features/custom-instructions)
- [Augment Code Guidelines](https://docs.augmentcode.com/setup-augment/guidelines)
- [Amazon Q Developer Project Rules](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/context-project-rules.html)
- [Aider Conventions](https://aider.chat/docs/usage/conventions.html)

### Framework AI Context
- [Next.js AI Agents Guide](https://nextjs.org/docs/app/guides/ai-agents)
- [Vercel Agent Skills Repo](https://github.com/vercel-labs/agent-skills)

### Community & Analysis
- [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules)
- [Augment Code: Context is a Junk Drawer](https://www.augmentcode.com/blog/your-agents-context-is-a-junk-drawer)
- [ai-context-kit](https://github.com/ofershap/ai-context-kit)
- [0xdevalias AI Agent Rule Notes](https://gist.github.com/0xdevalias/f40bc5a6f84c4c5ad862e314894b2fa6)
- [Vercel AGENTS.md Blog](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
- [Agent Rules Standard](https://github.com/agent-rules/agent-rules)
