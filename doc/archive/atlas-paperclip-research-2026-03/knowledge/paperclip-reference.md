# Paperclip — Reference & Setup Guide
**Source:** https://docs.paperclip.ing | **Captured:** 2026-03-27 | **Author:** Watson

> Paperclip is an open-source AI company control plane — a governance and delegation layer that sits on top of agent runtimes. It does NOT replace OpenClaw. It wraps fleets of agents with structure, budgets, audit trails, and approval gates.

---

## Core Concepts

### Five Primitives

| Concept | What It Is |
|---------|-----------|
| **Company** | Top-level org unit. Has a goal, employees (agents), org structure, budget, and task hierarchy. One Paperclip instance can run multiple companies. |
| **Agents** | Every employee is an AI agent. Has adapter type, role, reporting structure, capabilities, budget, and status. |
| **Issues** | Unit of work. Every issue has title, description, status, priority, assignee, and a parent issue tracing back to the company goal. |
| **Heartbeats** | Agents don't run continuously — they wake in execution windows triggered by schedule, assignment, comment, manual invoke, or approval resolution. |
| **Governance** | Some actions require board (human) approval: hiring agents, CEO strategy. Board can pause/resume/terminate any agent. Full audit trail. |

### Issue Status Lifecycle
```
backlog → todo → in_progress → in_review → done
                      |
                   blocked
```
Terminal states: `done`, `cancelled`. Transition to `in_progress` = atomic checkout — only one agent can own a task at a time. 409 Conflict if two agents race.

### Org Structure Rules
- CEO has no manager (reports to board/human operator)
- Every other agent has exactly one `reportsTo`
- **No cycles.** Strict tree.
- Cross-team tasks allowed — but an agent can't cancel them, only reassign upward
- Escalation path: blocked agent reassigns to manager
- `GET /api/companies/{companyId}/org` — view full org tree via API

---

## Installation & Deployment

### Quickstart (Local — Recommended for Experimentation)
```sh
npx paperclipai onboard --yes
```
Walks through setup, configures environment, starts server.

**One-command bootstrap (also auto-onboards if missing config):**
```sh
pnpm paperclipai run
```

**Manual dev start:**
```sh
pnpm install
pnpm dev
```
- API + UI at `http://localhost:3100`
- No external database required — uses embedded PostgreSQL by default

### Deployment Modes

| Mode | Auth | Best For |
|------|------|---------|
| `local_trusted` | No login | Solo local machine (default) |
| `authenticated` + `private` | Login via Better Auth | Team over Tailscale/VPN |
| `authenticated` + `public` | Login required | Cloud/internet-facing |

For our experiment: `local_trusted` on Jeremy's Mac mini. No auth overhead.

Set mode during onboard or update later:
```sh
pnpm paperclipai configure --section server
```

---

## CLI

### Usage
```sh
pnpm paperclipai --help
```

### Global Flags
| Flag | Description |
|------|-------------|
| `--data-dir <path>` | Isolate data from `~/.paperclip` |
| `--api-base <url>` | API base URL |
| `--api-key <token>` | Auth token |
| `--company-id <id>` | Scope to company |
| `--json` | JSON output |

### Context Profiles (avoid repeating flags)
```sh
pnpm paperclipai context set --api-base http://localhost:3100 --company-id <id>
pnpm paperclipai context show
pnpm paperclipai context use default
```
Store API key as env var (don't commit it):
```sh
pnpm paperclipai context set --api-key-env-var-name PAPERCLIP_API_KEY
export PAPERCLIP_API_KEY=...
```
Context stored at `~/.paperclip/context.json`.

### Command Categories
- **Setup commands** — instance bootstrap, diagnostics, config
- **Control-plane commands** — issues, agents, approvals, activity

---

## API

**Base URL:** `http://localhost:3100/api`

**Auth header:**
```
Authorization: Bearer <token>
```
Tokens: agent API keys (long-lived), agent run JWTs (injected as `PAPERCLIP_API_KEY` during heartbeats), or user session cookies.

**Include on all mutating heartbeat requests:**
```
X-Paperclip-Run-Id: <run-id>
```

### Error Codes
| Code | Meaning | Action |
|------|---------|--------|
| 400 | Validation error | Check request body |
| 401 | Unauthenticated | Missing/invalid API key |
| 403 | Unauthorized | No permission |
| 404 | Not found | Entity missing |
| **409** | **Conflict** | **Another agent owns task — pick different one. Do NOT retry.** |
| 422 | Semantic violation | Invalid state transition |
| 500 | Server error | Transient — comment on task and move on |

### Key Endpoints
```
GET  /api/companies/{companyId}/org              # Full org tree
GET  /api/companies/{companyId}/costs/summary    # Company spend
GET  /api/companies/{companyId}/costs/by-agent   # Per-agent spend
PATCH /api/companies/{companyId}                 # Update budget
PATCH /api/agents/{agentId}                      # Update agent
```

---

## Adapters

Adapters bridge Paperclip's orchestration to agent runtimes. Each agent has one `adapterType` + `adapterConfig`.

### Built-in Adapters

| Adapter | Type Key | Description |
|---------|----------|-------------|
| Claude Local | `claude_local` | Runs Claude Code CLI locally |
| Codex Local | `codex_local` | Runs OpenAI Codex CLI locally |
| Gemini Local | `gemini_local` | Runs Gemini CLI locally |
| OpenCode Local | `opencode_local` | Multi-provider via `provider/model` |
| **OpenClaw Gateway** | `openclaw_gateway` | **Sends wake payloads to an OpenClaw gateway** |
| Process | `process` | Executes arbitrary shell commands |
| HTTP | `http` | Sends webhooks to external agents |

### For Our Use Case
- **Director + tier-2 agents:** `openclaw_gateway` — Paperclip wakes Watson agents via OpenClaw
- **Tier-3 specialists (Copywriter, Graphics Designer):** likely `claude_local` — standalone Claude Code sessions
- **Order Tracker / Scheduler:** could be `process` (pure shell scripts) or `openclaw_gateway`

The `openclaw_gateway` adapter is the key integration point — it's how Paperclip talks to Watson's world.

---

## Budgets

- **Company budget:** monthly cap in cents (`budgetMonthlyCents`)
- **Per-agent budget:** same field on agent record
- **80% utilization:** soft alert — agent warned to focus on critical tasks
- **100% utilization:** hard stop — agent auto-paused
- Auto-paused agent resumes by increasing budget or waiting for next calendar month

---

## Creating a Company — Step by Step

1. **New Company** in web UI → name + description
2. **Set a Goal** (specific/measurable: e.g. "Run 2x/month Burn Island eruptions with $10K+ value each, zero fulfillment errors")
3. **Create CEO agent** — choose adapter, write prompt template, set budget
4. **Build org chart** — create direct reports one by one, each with `reportsTo` pointing to manager
5. **Set budgets** at company + per-agent level (conservative to start)
6. **Enable heartbeats** → agents start working

---

## Next Steps for Burn Island Setup

### Phase 1: Install & Validate (this session or next)
```sh
# Check if already installed
which paperclipai || npx paperclipai --version

# Bootstrap
npx paperclipai onboard --yes
# → opens http://localhost:3100
```

### Phase 2: Create the Company
- **Name:** Burn Island Ops Co.
- **Goal:** "Run Burn Island eruptions twice monthly at $10K+ value per event, with zero fulfillment errors and community hype for each launch"
- **Adapter for Director:** `openclaw_gateway` (Watson manages the Director)
- Start with Director only. Don't create all 10 agents at once.

### Phase 3: First Real Task
Assign Director this issue:
> "Plan weekly burn report cadence for MegaHeads window (April 7 – September 4). Output: post schedule, format template, and first post draft for April 8."

This maps directly to the `megaheads-burn-countdown-bot-spec.md` we already wrote — Director owns the cadence, Campaign Manager writes the copy.

### Phase 4: Evaluate Before Expanding
After one full task cycle, ask:
- Did structured delegation produce better output than a single agent?
- Did the Director escalate anything that needed Jeremy?
- Did the audit trail catch anything unexpected?
- Where did the task hierarchy feel right vs. forced?

If yes → staff Campaign Manager + Eruption Design. Leave Sentiment Monitor and Fulfillment Manager until the base org proves itself.

### Integration Note: Watson ↔ Paperclip Bus Bridge
The `openclaw_gateway` adapter handles Paperclip → Watson. For Watson → Paperclip (completions back), we'll need either:
- HTTP webhook from Watson emitting to Paperclip's API (create/update issue)
- Or: Paperclip polls Watson's completion events

This is the bus bridge work flagged in `analysis/burn-island-paperclip-org-plan.md`. Not day-one — Phase 2+ once the org runs one cycle.

---

## Key URLs
- **Docs:** https://docs.paperclip.ing
- **Full doc index:** https://docs.paperclip.ing/llms.txt
- **GitHub:** https://github.com/paperclipai/paperclip (18.5K stars, active)
- **Local UI (once running):** http://localhost:3100

## Related Files
- `analysis/burn-island-paperclip-org-plan.md` — full org chart + role definitions
- `analysis/investigations/paperclip-research-technical.md` — deep technical architecture dive
- `analysis/archive/paperclip-opus-strategy.md` — Opus strategy brief, top 3 ROI moves
- `data/megaheads-burn-countdown-bot-spec.md` — first Paperclip task candidate
