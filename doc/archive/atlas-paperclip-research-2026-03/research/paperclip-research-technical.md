# Paperclip Technical Deep Dive — Research Brief

**Date:** 2026-03-11  
**Scope:** Paperclipai/paperclip GitHub repo (main branch, ~v0.3.0)  
**Target audience:** Technical architecture and integration assessment

---

## 1. Executive Summary

Paperclip is an **open-source control plane for autonomous AI companies**. It's a Node.js + TypeScript server (Express REST API) with a React UI that orchestrates a team of AI agents to run a business. The system models companies as first-order objects with org charts, hierarchical task management, cost tracking, and governance controls.

**Key finding:** Paperclip is explicitly designed to work with agents like OpenClaw, Claude Code, Codex, and custom runtimes via an **adapter pattern**. OpenClaw integration is a V1 priority (see `OPENCLAW_ONBOARDING.md`).

---

## 2. Technical Stack

### Backend
- **Framework:** Express 5.x (TypeScript)
- **Database:** PostgreSQL (Drizzle ORM)
  - **Dev default:** Embedded PostgreSQL (PGlite) at `~/.paperclip/instances/default/db/`
  - **Prod options:** Docker Postgres or hosted Supabase
- **Auth:** Better Auth 1.4.18 (session-based + GitHub OAuth for ClipHub)
- **Logging:** Pino 9.6.0 with pino-http
- **API validation:** Zod 3.24.2
- **Server version:** v0.3.0

### Frontend
- **Framework:** React + Vite
- **Dev server:** Embedded in Express (dev middleware mode)
- **Built & served:** From Express at `http://localhost:3100` (dev) or Vercel (prod)

### Database
- **ORM:** Drizzle 0.38.4
- **Schema:** Located in `packages/db/src/schema/`
- **Migrations:** Generated via `pnpm db:generate`, applied with `pnpm db:migrate`
- **Key feature:** Company-scoped data isolation enforced at DB level

### Deployment Infrastructure
- **Local:** Node.js + embedded Postgres (zero config)
- **Docker:** Included `Dockerfile` and `docker-compose.yml`
- **Cloud:** Designed for Vercel, self-hosted VPS, or Supabase-backed setups
- **File storage:** Local disk default (`~/.paperclip/instances/default/data/storage`), optional S3-compatible object storage

---

## 3. Core Data Model (V1 Schema)

### Company Model
- **Table:** `companies`
- **Fields:** `id`, `name`, `description`, `status` (active|paused|archived), `created_at`, `updated_at`
- **Invariant:** Every business record belongs to exactly one company (multi-company isolation)

### Agent Model
- **Table:** `agents`
- **Key fields:**
  - `company_id` (fk to companies)
  - `name`, `role`, `title`
  - `status` (active|paused|idle|running|error|terminated)
  - `reports_to` (nullable fk to agents — strict tree)
  - `capabilities` (text description)
  - **`adapter_type`** (enum: `process | http`)
  - **`adapter_config`** (JSONB — adapter-specific config blob)
  - `context_mode` (thin|fat — payload delivery strategy)
  - `budget_monthly_cents`, `spent_monthly_cents`
  - `last_heartbeat_at`
- **Invariants:** 
  - No cycles in reporting tree
  - Single manager per agent
  - Agent and manager in same company
  - Terminated agents cannot be resumed

### Agent API Keys
- **Table:** `agent_api_keys`
- **Fields:** `id`, `agent_id`, `company_id`, `name`, `key_hash` (hashed at rest), `last_used_at`, `revoked_at`
- **Security:** Plaintext key shown once at creation; only hash stored in DB

### Goals / Initiatives
- **Table:** `goals`
- **Fields:** `id`, `company_id`, `title`, `description`, `level` (company|team|agent|task), `parent_id`, `owner_agent_id`, `status` (planned|active|achieved|cancelled)
- **Invariant:** At least one root `company`-level goal per company

### Projects
- **Table:** `projects`
- **Fields:** `id`, `company_id`, `goal_id`, `name`, `description`, `status` (backlog|planned|in_progress|completed|cancelled), `lead_agent_id`, `target_date`

### Issues (Core Task Entity)
- **Table:** `issues`
- **Fields:** `id`, `company_id`, `project_id`, `goal_id`, `parent_id`, `title`, `description`
- **Status:** `backlog | todo | in_progress | in_review | done | blocked | cancelled`
- **Ownership:** `assignee_agent_id` (single-assignee model), `created_by_agent_id`
- **Priority:** critical|high|medium|low

### Heartbeat Runs (Execution Tracking)
- **Table:** `heartbeat_runs`
- **Fields:** `id`, `agent_id`, `company_id`, `status`, `started_at`, `finished_at`, `invocation_source` (timer|assignment|on_demand|automation), `exit_code`, `signal`, `result_json`, `usage_json`, `log_ref`, `session_id_before`, `session_id_after`
- **Stores:** Execution history, cost data, session IDs for resumption

### Cost Events
- **Table:** `cost_events`
- **Tracks:** Token/LLM usage at agent, task, project, company levels
- **Model:** Agent costs reported back to Paperclip via API

### Activity Log (Immutable Audit)
- **Table:** `activity_log` (implicit in services)
- **Tracks:** All mutating actions (agent creation, task assignment, approvals, etc.)
- **Purpose:** Full audit trail for governance

---

## 4. Heartbeat System (Protocol & Execution)

### What Is a Heartbeat?

A **heartbeat is a scheduled invocation** of an agent's task cycle. Paperclip defines **when** and **how** to invoke; the agent defines **what** it does.

### Invocation Adapters

Paperclip uses an **adapter pattern** to invoke agents. Each agent has:
- `adapter_type` (e.g., `process`, `http`, `openclaw_gateway`)
- `adapter_config` (JSON blob specific to the adapter)

#### Built-in Adapter Types (V1)

| Adapter | Mechanism | Use Case | Status |
|---------|-----------|----------|--------|
| **`process`** | Execute a child process locally | Claude Code, Codex, custom scripts | ✅ Shipping |
| **`http`** | Send an HTTP webhook/API call | External agents, OpenClaw (initially) | ✅ Shipping |
| **`openclaw_gateway`** | WebSocket connection to OpenClaw Gateway | OpenClaw + Paperclip coordination | ✅ Shipping (V1) |
| `claude-local`, `codex-local`, `cursor-local`, `pi-local`, `gemini-local`, `opencode-local` | Language-specific adapter wrappers | AI IDE integration | ✅ Implemented |

**Sources:**
- `server/package.json` lists: `@paperclipai/adapter-claude-local`, `@paperclipai/adapter-codex-local`, `@paperclipai/adapter-openclaw-gateway`, etc.
- `packages/adapters/` directory structure confirms multiple adapter implementations

### Adapter Interface (Contract)

Every adapter implements three methods:

```typescript
invoke(agentConfig: Record<string, unknown>, context?: unknown) → void
status(agentConfig: Record<string, unknown>) → AgentStatus
cancel(agentConfig: Record<string, unknown>) → void
```

- **`invoke`:** Start the agent's cycle
- **`status`:** Check if running, idle, errored
- **`cancel`:** Graceful stop signal (for pause/resume)

### Heartbeat Trigger Types

| Trigger | Source | Description |
|---------|--------|-------------|
| **Timer** | Scheduler | Periodic execution (default: cron-like schedule) |
| **Assignment** | Task system | When a new task is assigned to the agent |
| **On-demand** | Board/UI | Manual trigger from operator |
| **Automation** | System event | Triggered by another agent or event |

### Heartbeat Flow

1. **Trigger fires** (timer, assignment, on-demand, automation)
2. **Adapter invokes agent** (process spawn, HTTP POST, WebSocket ping)
3. **Agent does work** (task execution, collaboration, etc.)
4. **Agent reports back** (optional — cost, status, task updates via API)
5. **Paperclip tracks** (execution logged, costs rolled up, next heartbeat scheduled)

### Pause & Resume

- **Pause:** Send graceful termination signal via adapter's `cancel()` method; stop future heartbeat cycles
- **Resume:** Resume future heartbeat cycles; current run gets grace period (timeout TBD, likely 15-30 sec)
- **Force-kill:** If agent doesn't respond to graceful signal within grace period, force-terminate

**Source:** `server/src/services/heartbeat.ts` implements heartbeat service; `SPEC.md` §4 defines protocol.

---

## 5. Agent Registration & Onboarding (How OpenClaw Plugs In)

### OpenClaw Integration Status

**OpenClaw is a V1 priority.** Dedicated documentation exists: `doc/OPENCLAW_ONBOARDING.md`.

### Registration Flow

1. **Create agent in Paperclip UI**
   - Set `adapter_type` to `openclaw_gateway`
   - Configure `adapter_config` with:
     - Gateway URL (e.g., `ws://localhost:18789`)
     - Auth token (non-empty, ≥16 chars)
     - Optional: device private key for pairing

2. **Generate invite prompt** (Paperclip → OpenClaw)
   - Endpoint: `POST /api/companies/{companyId}/openclaw/invite-prompt`
   - Returns: High-entropy prompt with all necessary Paperclip config
   - Board users can call this; CEO agents are limited to their own company

3. **Paste prompt into OpenClaw**
   - OpenClaw CLI processes the prompt
   - Registers itself as an agent in Paperclip
   - Establishes WebSocket connection to gateway

4. **Approve pairing request** (OpenClaw → Paperclip)
   - OpenClaw sends a pairing request
   - Board approves in Paperclip UI
   - Agent is now "hired" and ready to receive tasks

5. **First task**
   - Paperclip assigns a task to the OpenClaw agent
   - Heartbeat system invokes via gateway
   - OpenClaw fetches task context and executes
   - Reports results back via Paperclip API

### Adapter Configuration Details (OpenClaw Example)

```jsonb
{
  "url": "ws://localhost:18789",  // Gateway URL
  "headers": {
    "x-openclaw-token": "<auth-token>"
  },
  "disableDeviceAuth": false,
  "devicePrivateKeyPem": "<pem-encoded-key>",
  "sessionKeyStrategy": "fixed",
  "sessionKey": "paperclip",
  "role": "operator",
  "scopes": ["operator.admin"],
  "timeoutSec": 120,
  "waitTimeoutMs": 120000
}
```

**Source:** `server/src/services/company-portability.ts` defines default rules for `openclaw_gateway` adapter.

### API Authentication

- **Human (Board) auth:** Session-based (Better Auth)
- **Agent auth:** API keys (`agent_api_keys` table)
  - Key format: Bearer token (hashed at rest)
  - Scoped to single company
  - Can only access own tasks + company context + cost reporting

---

## 6. Task Management & Atomicity

### Single-Assignee Model

- Each task has exactly **one assignee** (`assignee_agent_id`)
- No multi-owner tasks; no delegation chains within Paperclip

### Atomic Checkout Semantics

```sql
UPDATE issues
SET status = 'in_progress'
WHERE id = ? AND assignee_agent_id = ? AND status = 'todo'
```

- Agent atomically claims a task (single SQL operation)
- If another agent already claimed it: request fails with conflict error
- If agent already owns it from a previous session: can resume

**Benefit:** Prevents double-work; no need for optimistic locking or CRDTs.

### Task Hierarchy

```
Company Goal (top-level initiative)
  ↓
Project (collection of work toward a goal)
  ↓
Issue/Task (atomic work unit)
    ↓
Sub-issue (breakdown of a task)
```

- Every task traces back to a company goal
- Agents always see the "why" (goal context)
- Comments enable coordination

### Cross-Team Work

- Agents can create tasks and assign them to agents outside their reporting line
- **Task acceptance rules:**
  - Agrees it's appropriate + can do it → complete directly
  - Agrees it's appropriate + can't do it → mark blocked
  - Doubts the task → reassign to their manager, explain
  - Manager decides: accept, reassign, or escalate

- **Depth tracking:** Tasks track number of delegation hops (original requester → X hops → executor)
- **Billing codes:** Optional field to attribute costs upstream

**Source:** `SPEC.md` §3 (Org Structure) and §5 (Inter-Agent Communication).

---

## 7. Cost Tracking & Budget Enforcement

### Cost Model

- **Granular tracking:** Per-agent, per-task, per-project, per-company
- **Denominations:** Both tokens and USD
- **Reporting:** Agents report usage back via API after execution

### Cost Events Table

```sql
CREATE TABLE cost_events (
  id uuid,
  agent_id uuid,
  task_id uuid,
  project_id uuid,
  company_id uuid,
  cost_usd decimal,
  tokens_used int,
  timestamp timestamptz
)
```

### Budget Controls (Three Tiers)

1. **Visibility:** Dashboards showing spend at every level
2. **Soft alerts:** Configurable thresholds (warn at 80% of budget)
3. **Hard ceiling:** Auto-pause agent when budget is hit
   - Board is notified
   - Board can override or raise the limit
   - Agent resumes when budget is increased

### Budget Period

- **Default:** Monthly UTC calendar window (resets on month boundary)
- **Per-agent:** `budget_monthly_cents` and `spent_monthly_cents` columns in `agents` table

### Cost Reporting API

Agents POST cost events after execution:

```
POST /api/agents/{agentId}/cost-event
{
  "taskId": "<uuid>",
  "costUsd": 0.25,
  "tokensUsed": 1200,
  "model": "gpt-4"
}
```

**Atomic enforcement:** If an agent's run would exceed budget, the API call fails with a 409 (conflict) error and the agent pauses.

---

## 8. Agent Context Delivery

### Thin vs. Fat Payload

Configurable per agent via `context_mode` field:

| Mode | Description | Use Case |
|------|-------------|----------|
| **`thin`** | Heartbeat is just a wake-up signal | Sophisticated agents (OpenClaw) that manage own state |
| **`fat`** | Paperclip bundles task, goals, org chart, metrics | Simpler agents that can't call back to API |

### Fat Payload Contents (Example)

- Current assigned tasks
- Company goal + mission
- Reporting hierarchy (who's the boss, who reports to you)
- Recent messages/comments
- Current project context
- Metrics/performance data

### Thin Ping Example (OpenClaw)

```
POST <gateway-url>
{
  "agentId": "<uuid>",
  "agentSessionKey": "paperclip",
  "trigger": "assignment"
}
```

Agent then calls back to `GET /api/agents/<agentId>/tasks` to fetch context.

---

## 9. Governance & Approval Gates

### Board Powers (Always Available)

- Set and modify company budgets
- Pause/resume any agent (immediately)
- Pause/resume any work item (task, project, subtask tree)
- Full project management (create, edit, delete, reassign, comment)
- Override any agent decision
- Manually change any budget at any level

### Approval Gates (V1)

| Action | Gate | Approver |
|--------|------|----------|
| **Hire new agent** | Approval required | Board only |
| **CEO strategy** | CEO proposes, board approves | Board only |
| **Pause/terminate agent** | Immediate (no approval needed) | Board only |
| **Budget override** | Immediate (no approval needed) | Board only |

### Versioned Configs

- Agent configs are versioned (implicit in data model)
- Config changes are logged to activity log
- Bad changes can be rolled back (manual process)

**Source:** `SPEC-implementation.md` §3 (Explicit V1 Product Decisions).

---

## 10. Multi-Company Isolation

### Company Scoping

Every core table includes `company_id` foreign key:
- `agents.company_id`
- `issues.company_id`
- `projects.company_id`
- `goals.company_id`
- `activity_log.company_id`

### Route-Level Enforcement

All API routes enforce company access checks:
- Human users see only companies they're members of
- Agent API keys are scoped to a single company
- Agents cannot access other companies' data

### Audit Trail Per Company

- Activity log is company-scoped
- Cost tracking is company-scoped
- Session isolation via `company_id` in every query

**Source:** `AGENTS.md` §5 (Core Engineering Rule #1: "Keep changes company-scoped").

---

## 11. ClipHub — Company Template Registry

### What Is ClipHub?

A **separate hosted service** (not part of the Paperclip app itself) that acts as a public registry for company templates. Think: npm for companies.

### What Gets Published

A ClipHub package is a **portable company export** containing:
- Company metadata (name, description, category)
- Org chart (full reporting hierarchy)
- Agent definitions (name, role, title, capabilities)
- **Adapter configs** (for each agent — SOUL.md, HEARTBEAT.md, process commands, etc.)
- Seed tasks (starter initiatives)
- Budget defaults

### Key Features

| Feature | Details |
|---------|---------|
| **Browse** | Featured, popular, recent, by category |
| **Search** | Semantic (via vector embeddings) + keyword + filters |
| **Stars** | Bookmark and signal quality |
| **Comments** | Threaded discussion per template |
| **Install** | `paperclipai install cliphub:<publisher>/<slug>` |
| **Fork** | Create derivative, track lineage |
| **Versioning** | Semver, version history, immutable archives |

### Sub-Packages

Not just full companies:
- **Agent templates** (single agent config, e.g., "Senior Python Engineer")
- **Team templates** (subtree of org, e.g., "Marketing Team")
- **Adapter configs** (reusable, adapter-agnostic)

### Publishing & Moderation

- **Auth:** GitHub OAuth
- **Verification:** Automated scanning for suspicious adapter configs (arbitrary code execution, exfiltration)
- **Community reporting:** Users can flag templates
- **Verified badges:** Publishers with good track record get visibility boost
- **Account gating:** New accounts have waiting period before publishing

### Architecture

| Layer | Tech |
|-------|------|
| Frontend | React + Vite |
| Backend | TypeScript + Hono |
| Database | PostgreSQL |
| Search | Vector embeddings |
| Auth | GitHub OAuth |
| Storage | S3-compatible object storage (zips) |

**Status:** V1 core feature shipped. V2 adds forking, comments, verified badges, ClipHub panel in Paperclip UI.

**Source:** `doc/CLIPHUB.md` (comprehensive spec).

---

## 12. Company Portability (Export/Import)

### Export Format

Paperclip can export a company as a portable template:

```bash
paperclipai export --template my-company
```

Produces a JSON manifest + associated files:

```json
{
  "company": { "name": "...", "description": "..." },
  "agents": [
    {
      "id": "<uuid>",
      "name": "...",
      "role": "...",
      "adapterType": "openclaw_gateway",
      "adapterConfig": { "url": "...", "headers": {...} }
    }
  ],
  "goals": [...],
  "requiredSecrets": [
    { "key": "API_KEY", "description": "...", "agentSlug": "..." }
  ]
}
```

### Sensitive Data Scrubbing

The export system **automatically redacts** sensitive fields:
- API keys, tokens, auth headers
- Inline credentials
- Private keys

These are replaced with **required secret metadata** that the importer must provide at import time.

### Collision Handling

When importing, if name/agent collisions occur:

| Strategy | Behavior |
|----------|----------|
| `rename` (default) | Rename colliding agents (e.g., "Agent A" → "Agent A 2") |
| `merge` | Attempt to merge with existing agent (danger: overwrite) |
| `fail` | Abort if collisions detected |

### Import Flow

```bash
paperclipai import --file exported-company.json --collision-strategy rename
```

1. Parse manifest
2. Check for collisions
3. Apply collision strategy
4. Create agents + org structure
5. Prompt for required secrets
6. Create initial tasks (from seed list)

**Source:** `server/src/services/company-portability.ts` (detailed implementation).

---

## 13. Runtime Components & Architecture

### Server Structure

```
server/src/
  ├─ routes/              # REST API endpoints
  ├─ services/            # Business logic
  │  ├─ heartbeat.ts      # Heartbeat orchestration
  │  ├─ agents.ts         # Agent CRUD
  │  ├─ issues.ts         # Task management
  │  ├─ costs.ts          # Cost tracking
  │  ├─ companies.ts      # Company lifecycle
  │  ├─ company-portability.ts  # Export/import
  │  ├─ approvals.ts      # Governance gates
  │  └─ live-events.ts    # Real-time updates
  ├─ adapters/            # Adapter implementations
  ├─ middleware/          # Auth, logging, error handling
  └─ app.ts               # Express app setup
```

### Adapter Layer

```
server/src/adapters/
  ├─ index.ts             # Adapter registry
  ├─ process.ts           # Process adapter implementation
  ├─ http.ts              # HTTP adapter implementation
```

Package adapters are in `packages/adapters/`:
```
packages/adapters/
  ├─ adapter-utils/
  ├─ openclaw-gateway/
  ├─ claude-local/
  ├─ codex-local/
  ├─ ... (others)
```

### Database Client

```
packages/db/
  ├─ src/
  │  ├─ schema/           # Drizzle table definitions
  │  ├─ client.ts         # Postgres connection
  │  ├─ migrations/       # Schema migrations
  │  ├─ seed.ts           # Seed data (optional)
  │  └─ migrate.ts        # Migration runner
```

### Authentication

**Human auth:**
- Better Auth 1.4.18 for session management
- GitHub OAuth for ClipHub publishing

**Agent auth:**
- API keys (`agent_api_keys` table)
- Hashed at rest; plaintext shown once at creation
- Bearer token format

---

## 14. Deployment Modes

### `local_trusted`

- **Binding:** Localhost only (127.0.0.1)
- **Auth:** No login required
- **Use case:** Single operator, local machine workflow
- **Database:** Embedded PostgreSQL default
- **Setup:** Fastest onboarding (`pnpm dev`)

### `authenticated` + `private`

- **Binding:** Private network (Tailscale, VPN, LAN)
- **Auth:** Login required (Better Auth sessions)
- **Database:** Docker Postgres or Supabase
- **Use case:** Team access without internet exposure
- **URL handling:** Auto mode (infer base URL from request)

### `authenticated` + `public`

- **Binding:** Internet-facing
- **Auth:** Login required (strict)
- **Database:** Hosted Postgres (Supabase recommended)
- **Use case:** Cloud deployment
- **URL handling:** Explicit public URL required
- **Checks:** Stricter deployment validation ("doctor" checks)

### Migration Path

- **Local → Private:** Set `AUTHENTICATED=true`, configure private URL
- **Private → Public:** Explicit public URL, enable stricter checks
- **Board claim flow:** When migrating from local_trusted to authenticated, one-time claim URL allows initial board user to claim ownership

**Source:** `doc/DEPLOYMENT-MODES.md` (canonical model).

---

## 15. OpenClaw Integration Details

### Onboarding Checklist

From `doc/OPENCLAW_ONBOARDING.md`:

1. **Start Paperclip in auth mode**
   ```bash
   pnpm dev --tailscale-auth
   ```

2. **Start OpenClaw Docker**
   ```bash
   OPENCLAW_RESET_STATE=1 OPENCLAW_BUILD=1 ./scripts/smoke/openclaw-docker-ui.sh
   ```

3. **Generate invite prompt** (Paperclip UI → Settings → Invites → "Generate OpenClaw Invite Prompt")

4. **Paste into OpenClaw** main chat

5. **Approve join request** in Paperclip UI

6. **Gateway preflight checks:**
   ```bash
   AGENT_ID="<newly-created-agent-id>"
   curl -H "Cookie: $PAPERCLIP_COOKIE" \
     http://127.0.0.1:3100/api/agents/$AGENT_ID | jq \
     '{adapterType, adapterConfig: {url, tokenLen, hasDeviceKey}}'
   ```

   Expected output:
   - `adapterType`: "openclaw_gateway"
   - `tokenLen`: ≥16 characters
   - `hasDeviceKey`: true
   - Device auth enabled (default)

7. **Pairing handshake:**
   - OpenClaw automatically attempts pairing on first gateway run
   - If pairing required but not pending, device auth token may be stale
   - Approve device in OpenClaw: `openclaw devices approve --latest`

8. **Test cases:**
   - **Case A:** Task assigned to OpenClaw agent → post comment + mark done → verify in UI
   - **Case B:** Send message via `message` tool + comment on issue → verify both appear
   - **Case C:** New `/new` session → create CLA issue → verify appears in Paperclip

### API Contracts

**Task fetch:** `GET /api/issues?assigneeId=<agentId>&status=todo`

**Task update:** `PATCH /api/issues/<issueId>` with `status`, `comment`

**Cost report:** `POST /api/agents/<agentId>/cost-event` with `taskId`, `costUsd`, `tokensUsed`

**Company context:** `GET /api/companies/<companyId>/context` (org chart, goals, agents)

---

## 16. What's NOT in V1 (Out of Scope)

| Feature | Status |
|---------|--------|
| Plugin framework / third-party SDK | Future |
| Revenue/expense accounting beyond token costs | Future |
| Knowledge base subsystem | Future |
| ClipHub public marketplace | V1 core shipped; V2 adds comments/forking |
| Multi-board governance | Future |
| Role-based human permission granularity | Future |
| Automatic self-healing orchestration (auto-reassign) | Future |
| Private registries (ClipHub enterprise) | Future |

---

## 17. Pricing & Monetization Model

**Current status:** **No pricing model mentioned in public docs.**

**Open-source strategy:**
- MIT license
- Self-hosted (no SaaS lock-in)
- Free to use, build, deploy
- ClipHub is a registry (not a runtime) — initially free and public

**Future monetization options** (not documented):
- Likely candidates: ClipHub premium features (private templates, advanced analytics), Paperclip cloud hosting, enterprise support
- **But:** No official pricing or cloud version announced

**Source:** `LICENSE` (MIT), README tagline ("Built for people who want to run companies, not babysit agents"), `doc/GOAL.md` (vision but no pricing model).

---

## 18. Key Design Principles

1. **Unopinionated about agent runtimes** — agents can be OpenClaw, Claude Code, Codex, Python scripts, bash, HTTP-callable services. Paperclip doesn't care.

2. **Company is the unit of organization** — not projects, not teams. Companies are first-order. Everything else is scoped to a company.

3. **Adapter config defines the agent** — agent identity (SOUL.md, HEARTBEAT.md, etc.) lives in `adapterConfig`, not Paperclip core.

4. **All work traces to the goal** — every task has a parent goal chain. Agents always see the "why."

5. **Control plane, not execution plane** — Paperclip orchestrates; agents execute. Agents run wherever they run and phone home.

6. **Atomic execution** — task checkout is atomic, budget enforcement is hard, no double-work.

7. **Full visibility, human governance** — board has unrestricted access at all times. Human-in-the-loop is core.

**Source:** `PRODUCT.md` § Principles and `SPEC.md` § Overview.

---

## 19. Known Integration Points with OpenClaw

### 1. Gateway Pattern

Paperclip connects to OpenClaw via **WebSocket gateway** (not direct REST). The adapter:
- Initiates WebSocket connection to OpenClaw Gateway
- Sends heartbeat pings to wake OpenClaw agent
- OpenClaw agent checks Paperclip API for tasks
- Reports results back via Paperclip REST API

### 2. Pairing & Device Auth

- OpenClaw agents authenticate via **device auth** (PEM-encoded keypair)
- Stored in `adapterConfig.devicePrivateKeyPem`
- Gateway token in `adapterConfig.headers["x-openclaw-token"]`
- Automatic pairing on first run (with approval)

### 3. Session Management

- OpenClaw maintains session state across heartbeats
- Paperclip tracks session IDs: `sessionIdBefore`, `sessionIdAfter` in `heartbeat_runs` table
- Allows resumption of multi-step work

### 4. Skills & SOUL.md

- OpenClaw agents load a **Paperclip SKILL.md** at runtime
- Skill teaches interaction with Paperclip API (task CRUD, cost reporting, company context)
- Adapter-agnostic — could be injected into any agent type

### 5. Cost Attribution

- OpenClaw reports usage back via: `POST /api/agents/<agentId>/cost-event`
- Costs are attributed to tasks and roll up to projects/company

---

## 20. Repository Snapshot (as of 2026-03-11)

| Metric | Value |
|--------|-------|
| **Stars** | 18,543 |
| **Forks** | 2,303 |
| **Language** | TypeScript |
| **License** | MIT |
| **Last updated** | 2026-03-11 18:43:49 UTC |
| **Open issues** | 404 |
| **Node.js requirement** | ≥20 |
| **pnpm requirement** | ≥9.15 |
| **Monorepo structure** | pnpm workspace |

**Source:** GitHub API `/repos/paperclipai/paperclip` endpoint.

---

## 21. Roadmap Highlights

- ✅ OpenClaw onboarding (in progress, V1)
- ✅ Cloud agents (Cursor, e2b agents) — in progress
- ⚪ ClipHub (company template registry) — V1 core shipped
- ⚪ Easy agent configurations
- ⚪ Better harness engineering support
- ⚪ Plugin system (custom knowledge bases, tracing, queues)
- ⚪ Better documentation

---

## 22. Technical Debt & Known Gaps

1. **Database migrations:** Issue noted in DATABASE.md about migration generation
2. **ClipHub V2 features:** Comments, forking, verified badges, Paperclip UI panel
3. **Plugin system:** Not yet shipped; would allow third-party adapters and extensions
4. **Multi-board governance:** Currently single-board model only

---

## 23. Comparison: Paperclip vs. OpenClaw

| Aspect | OpenClaw | Paperclip |
|--------|----------|-----------|
| **Scope** | Single AI employee (agent runtime) | Company of AI agents (orchestration) |
| **Use case** | "I want an AI assistant to help me work" | "I want AI agents to run my business" |
| **State** | Session-based (heartbeat loop) | Task-based (work items + comments) |
| **Auth** | Device auth, tokens | User sessions + API keys per agent |
| **Cost tracking** | Token usage per session | Token budget per agent per month |
| **Governance** | Limited (single agent) | Full (org chart, approvals, pause/resume) |
| **Communication** | Messages in session | Tasks + comments |
| **Multi-agent** | Not native | Core feature (org structure) |
| **Relationship** | Paperclip's **execution adapter** | OpenClaw's **orchestration layer** |

---

## 24. References & Sources

| Document | Location | Key Info |
|----------|----------|----------|
| `AGENTS.md` | Root | Contributor guidance, core engineering rules |
| `README.md` | Root | Feature overview, quickstart |
| `SPEC.md` | `doc/` | Long-horizon product spec |
| `SPEC-implementation.md` | `doc/` | V1 concrete contract |
| `DATABASE.md` | `doc/` | Schema, migrations, DB setup |
| `PRODUCT.md` | `doc/` | Product model, core concepts |
| `GOAL.md` | `doc/` | Vision statement |
| `CLIPHUB.md` | `doc/` | Company template registry design |
| `OPENCLAW_ONBOARDING.md` | `doc/` | OpenClaw integration guide |
| `DEPLOYMENT-MODES.md` | `doc/` | local_trusted vs. authenticated |
| `server/package.json` | `server/` | Dependencies, version |
| `server/src/services/heartbeat.ts` | `server/` | Heartbeat implementation |
| `server/src/services/company-portability.ts` | `server/` | Export/import logic |

---

## 25. Summary for Integration Planning

### For OpenClaw Teams

1. **Paperclip is explicitly designed to integrate with OpenClaw.** The `openclaw_gateway` adapter is V1 shipping.
2. **Pairing is device-auth based.** Requires PEM keypair + auth token. Automatic approval on first run.
3. **Tasks are the unit of work.** OpenClaw agents fetch tasks via Paperclip API and report progress.
4. **Cost attribution is automatic.** OpenClaw reports usage; Paperclip rolls up costs per agent.
5. **Sessions persist across heartbeats.** OpenClaw can maintain state via session IDs.

### For Paperclip Operators

1. **Hire OpenClaw agents like any other.** Generate invite prompt, paste into OpenClaw, approve pairing.
2. **Full multi-company support.** One Paperclip deployment can run dozens of autonomous companies.
3. **Cost control is enforced hard.** Agents auto-pause at budget limit; board can override.
4. **Export/import for templates.** Build a company, export it, share it via ClipHub.
5. **Deployment flexibility.** Start local (embedded Postgres), move to cloud (Supabase).

---

**Report compiled:** 2026-03-11 17:32 EDT  
**Analysis depth:** Technical architecture (data model, heartbeat system, adapters, orchestration)  
**Gaps identified:** None critical. Monetization model and specific plugin API are TBD in public docs.
