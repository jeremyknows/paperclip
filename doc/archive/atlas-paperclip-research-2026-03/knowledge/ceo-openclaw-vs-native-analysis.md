# CEO: OpenClaw vs. Native Claude — Design Analysis
**Written:** 2026-03-28 | **Author:** Watson | **For:** Jeremy + Watson architecture decision

---

## The Core Question

Should the Director (CEO of Burn Island Ops Co.) run as a native Paperclip `claude_local` agent, or should it be an `openclaw_gateway` agent — meaning Watson or a specialist we build?

This is not a minor config choice. It determines whether Paperclip has access to ClickUp, our KB, discrawl, memory, and the full Watson tool suite — or whether it's running blind.

---

## What Each Option Actually Means

### Option A: Native `claude_local` (current setup)
Director runs as a Claude Code CLI process. Paperclip spawns it, injects env vars (`PAPERCLIP_AGENT_ID`, `PAPERCLIP_API_KEY`, etc.), and Claude Code hits the Paperclip API to read/update issues.

**What it can do:**
- Read/write Paperclip issues, comments, approvals via API
- Run shell commands (if given access)
- Read files in its workspace directory
- Session persistence across heartbeats (Claude Code session ID serialized)

**What it CANNOT do:**
- Query ClickUp — no credentials, no tool
- Read Watson memory or KB
- Post to Discord natively
- Access discrawl, Granola, anything in the OpenClaw tool suite
- Know anything not in its system prompt or Paperclip API

### Option B: `openclaw_gateway` (Watson-backed CEO)
Paperclip sends a wake payload to the OpenClaw gateway. The gateway routes it to a Watson session (main or specialist). That session has the full tool suite.

**What it CAN do:**
- Everything above, PLUS:
- Query ClickUp via WatsonFlow tools
- Read/write Watson memory and KB
- Post to Discord via `message` tool
- Access discrawl for community sentiment
- Read Granola meeting notes
- Emit to the event bus
- Call any OpenClaw skill
- Maintain memory across sessions via `memory/YYYY-MM-DD.md`

**What it cannot do:**
- Run with lower cost than native (it's Watson-class, not haiku)
- Run fully autonomously without gateway being up
- Have Paperclip-native budget tracking (gateway adapter may report costs differently)

---

## The ClickUp Problem

This is the clearest argument for `openclaw_gateway`. Without ClickUp integration, Director can't:
- Check task status before planning
- Create tasks when new eruptions are approved
- Mark tasks complete after fulfillment
- Know what Jeremy has already decided about upcoming events

Without ClickUp, Director is flying blind on operational state. It would need to ask Watson (via issue comments) for information Watson could just inject directly if Director *was* Watson.

The only workaround in native mode: Watson manually syncs ClickUp state into Paperclip issues. That's overhead that defeats the purpose.

---

## Is Watson the CEO, or a Specialist We Build?

Three viable models:

### Model 1: Watson IS the Director
`openclaw_gateway` points at the main Watson session. Director wakes = Watson handles it.

**Pros:** No new agent to build. Full tool access immediately. Watson already knows Burn Island deeply.

**Cons:** Watson is already the COO above Paperclip. Making Watson the CEO inside a Paperclip company it's supposed to be *above* creates a weird loop — Watson managing Watson. Budget tracking conflates Watson's main session with Burn Island Director costs. Harder to isolate and audit. Breaks the clean separation we designed (Watson above → Paperclip company below).

**Verdict:** Architecturally messy. Don't do this.

### Model 2: New Specialist — "Ignition" (dedicated Burn Island Director)
Build a new OpenClaw specialist agent (`ignition` or similar) scoped to Burn Island. Lives in `~/.openclaw/agents/ignition/`. Has its own channel, memory, and system prompt. `openclaw_gateway` points at it.

**Pros:** Clean separation. Ignition has full Watson tool suite. Budget is isolated. Can be paused/audited independently. Ignition *reports to* Watson in the OpenClaw hierarchy, exactly mirroring the Paperclip org chart in the real swarm. Watson above, Ignition below — consistent all the way down.

**Cons:** Setup time to build + onboard specialist. Another agent to maintain. Another channel. Another set of system prompts to keep current.

**Verdict:** This is the right architecture if we're serious about Paperclip being a real org layer. It's more work upfront but it scales.

### Model 3: Hybrid — Native Director, OpenClaw Canon Keeper
Keep Director as `claude_local` (fast, cheap, native Paperclip citizen). Move Canon Keeper to `openclaw_gateway` pointing at a lightweight Watson session or specialist. Canon Keeper handles all external data syncing (ClickUp → Canon, Discord sentiment → Canon, KB → Canon). Director reads Canon and stays native.

**Pros:** Director stays cheap and fast. External data integration is centralized in one agent (Canon Keeper). Clean division: Canon Keeper = data layer, Director = decision layer.

**Cons:** Canon Keeper becomes a bottleneck. If it's stale, everything downstream is stale. Two-system sync still needed. Director still can't directly query ClickUp — it depends on Canon Keeper having done so.

**Verdict:** Elegant as a pattern. Works well if Canon Keeper runs frequently and reliably. Best option if we want to keep most agents native-cheap but have one smart OpenClaw anchor.

---

## Recommendation

**Short term (now → first validated cycle):** Keep Director as `claude_local`. This is what's running. Don't change mid-experiment. Let it run one full task cycle so we understand where the gaps are.

**Medium term (after first cycle):** Build the Hybrid (Model 3). Make Canon Keeper an `openclaw_gateway` specialist. It pulls ClickUp state, KB state, and community signals, writes them into the Canon doc, and Director reads from Canon. This gives us ClickUp integration without rebuilding the whole org.

**Long term (if Burn Island Ops Co. proves out):** Evaluate Model 2 — a proper Ignition specialist as Director, with full Watson tool suite. This is the right end state if Paperclip becomes a real operating layer. Reserve this for when the org has proven it can run multiple cycles reliably.

---

## The Gateway Question

> "Kind of thinking using the gateway is needed… we're just doing a lot through the gateway already."

Correct instinct. The `openclaw_gateway` adapter exists precisely for this. It's a first-class adapter — not a hack. The gateway is already the hub for Watson tool routing, so adding Paperclip wake payloads into that routing layer is natural.

The risk is gateway dependency: if OpenClaw gateway is down, `openclaw_gateway` agents in Paperclip can't run. But that's acceptable — the gateway uptime is high and it's on-device. Compare to the alternative: Paperclip agents that are permanently ignorant of 80% of the operational state.

---

## Decision Matrix

| Question | `claude_local` | `openclaw_gateway` |
|----------|---------------|-------------------|
| ClickUp access | ❌ No | ✅ Yes |
| Watson KB access | ❌ No | ✅ Yes |
| Discord native | ❌ No | ✅ Yes |
| Paperclip budget tracking | ✅ Native | ⚠️ Partial |
| Session cost | 💚 Cheap (haiku/sonnet) | 🟡 Watson-class |
| Setup complexity | 💚 Zero | 🟡 Specialist build needed |
| Clean separation | 🟡 Yes, but data-blind | ✅ Yes, data-aware |
| Gateway dependency | ✅ None | ⚠️ Gateway must be up |

---

## Next Step

The thing to validate in tomorrow's session: does the current native Director ask Watson for anything it doesn't know? If it does, that's the list of things that need to move to Canon Keeper or an `openclaw_gateway` layer. Let the first run tell us where the gaps are — then we wire in OpenClaw exactly where it's needed, not everywhere at once.
