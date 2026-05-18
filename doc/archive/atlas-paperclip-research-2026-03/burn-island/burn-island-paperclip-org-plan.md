# Burn Island — Paperclip Org Chart Plan
**Date:** 2026-03-27 | **Author:** Watson | **For:** Jeremy

---

## What We Know About Burn Island (Knowledge Synthesis)

### Core Mechanics
- **Launched:** February 2023
- **Purpose:** Dynamic platform where NFT holders burn digital tokens (BOOK GAMES) for exclusive physical or experiential rewards
- **Primary burn token:** BOOK GAMES (125K NFTs originally on IMX, now on Base blockchain since Oct 2025)
- **BOOK GAMES origin:** Earned by purchasing 12+ copies of Gary's book *Twelve and a Half*
- **Token value:** ~$60 base. Target 20-40% premium value per burn event ($10K+ total per event)
- **Only the VeeFriends Wallet** can burn on Burn Island (external wallets can hold, not burn) — deliberate wallet adoption driver

### Two Event Formats
1. **Eruptions** — Limited-time, specific NFT → specific prize. BOOK GAMES (or sometimes other NFTs) burned for defined reward set. Clear value ratio (e.g., 1 BOOK GAMES token → 5 CGC graded Super Stickers)
2. **Treasure Chest** — Rotating rare item redemption at special rates, limited time

**Q2 2026 change:** "Treasure Chest" branding being folded into "Burn Island" — single unified brand, eliminating dual messaging confusion. Timeline: 6-8 weeks.

### Known Eruption History (sampled)
| # | Eruption | Notable |
|---|----------|---------|
| 1 | Dynamic Dinosaur sweepstakes | 283 burned |
| 2 | Chromie Squiggle Auction | 465 burned |
| 20 | 5 CGC Graded Super Stickers (Eruption 20) | First "Burn Island" character Super Sticker; rarity tiers Magma/Ash Cloud/Obsidian/Stranded/1/1 Autograph; S1 holders claimed free |
| 21 | Chrome & Cocktails | May 2025 |
| 22 | (First Base-chain eruption) | 1 BOOK GAMES = chance at Topps Chrome Sapphire Box (~$6K value); 1 winner |
| 23 | Manga Pose | S2 holders swap resting pose → manga pose |
| MH | MegaHeads burn window | Opens April 7, 2026; S2 token burn → Topps Chrome 2026 exclusive insert; FCFS; window through Labor Day |

### Current Operations (from Mar 23 Granola meeting)
- **Cadence:** 2x per month (every 2 weeks goal)
- **Inventory sources:** Gary overflow requests, customer support excess, aging inventory (TVs from old Gift Goat, spec stickers), LIC warehouse cleanout (Rae providing list)
- **Fulfillment:** Ghost PDP system in Shopify (winners get email → fill shipping cart → manual SKU swap). Tom potentially reshaping this in 3-6 months.
- **One approved event remaining** before new inventory needed
- **Branding:** Treasure Chest → consolidating into Burn Island umbrella in Q2 (6-8 wks)
- **Onboarding friction:** Historically high — VF ran live onboarding sessions for Eruption 20. First-timer flow is still a pain point.

### Banter / Content Angle
- "Burn Island Banter" visual brand exists (images generated, lava/diamond/emerald/hologram themes)
- Tech test confirmed (calendar invite found in memory)
- Community dream: "someone hired just to book games on Burn Island" (Discord user verbatim)
- Burn Island character canonized as its own VeeFriends Super Sticker (Eruption 20) — the *island itself* is now a character in the universe

### Knowledge Gaps We Have
- Reward distribution data (how many burns per eruption historically)
- Secondary market data for burned/exchanged items
- Full inventory of available Burn Island products going forward
- Onboarding conversion metrics (how many first-timers successfully burn end-to-end)

---

## Proposed Burn Island Paperclip Company

**Company name:** Burn Island Ops Co.  
**Reporting to Watson:** Yes — Watson as external orchestrator, not inside the company  
**Footprint:** 5 agents (lean start), can expand to 7

### Org Chart

```
                         ┌─────────────────┐
                         │    Director     │
                         └────────┬────────┘
     ┌───────────┬────────────────┼──────────────┬──────────────┐
     ▼           ▼                ▼              ▼              ▼
┌──────────┐ ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌───────────┐
│  Canon   │ │ Eruption │  │ Campaign   │  │Sentiment │  │Fulfillment│
│  Keeper  │ │  Design  │  │  Manager   │  │ Monitor  │  │  Manager  │
└──────────┘ └────┬─────┘  └─────┬──────┘  └──────────┘  └─────┬─────┘
                  │              │                               │
             ┌────┴──────┐  ┌────┴──────────────┐        ┌──────┴──────┐
             ▼           ▼  ▼        ▼           ▼        ▼
         ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
         │Inventory │ │Incentives│ │Scheduler │ │Copywriter│ │ Graphics │ │  Order   │
         │ Manager  │ │Specialist│ │          │ │          │ │ Designer │ │ Tracker  │
         └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**Canon Keeper** is a parallel authority layer — reports to Director but serves the entire org. All agents read from Canon before acting. All agents write back when state changes. If it's not in Canon, it doesn't exist.

### Role Definitions

#### Director (CEO)
- **Mission:** Own the Burn Island calendar, inventory health, and event-to-event strategy
- **Key responsibilities:**
  - Maintain burn event schedule (2x/month cadence)
  - Brief and coordinate all five direct reports
  - Write post-event retrospective (what burned, yield, community reaction)
  - Interface with Watson for escalations and decisions requiring Jeremy
- **Direct reports:** Canon Keeper, Eruption Design, Campaign Manager, Sentiment Monitor, Fulfillment Manager
- **Adapter:** claude_local

#### Canon Keeper
- **Mission:** Source of truth for the entire org. Owns all rules, constraints, current state, and definitions. Does not execute tasks — defines reality for agents that do.
- **Authority:** Parallel layer. All agents read from Canon before acting. All agents write back when state changes. Canon wins in all conflicts.
- **Rule:** If it's not in Canon, it doesn't exist.
- **Key responsibilities:**
  - Maintain the Canon doc (pinned issue visible to all agents)
  - Audit all agent contexts on heartbeat — flag drift
  - Broadcast update comments when Canon changes so all agents see the change
  - Resolve conflicts: if two agents have contradictory assumptions, Canon adjudicates
- **Adapter:** claude_local

#### Eruption Design
- **Mission:** Design the mechanics of each burn event — format, value ratios, rarity tiers, reward structure
- **Direct reports:** Inventory Manager, Incentives Specialist
- **Key responsibilities:**
  - Draft eruption brief for each event
  - Model value ratio: base token value vs. reward value (target 20-40% premium)
  - Flag when a format is reusable vs. new
- **Adapter:** claude_local

#### Inventory Manager (reports to Eruption Design)
- **Mission:** Track available rewards, sources, and supply levels for upcoming eruptions
- **Adapter:** claude_local

#### Incentives Specialist (reports to Eruption Design)
- **Mission:** Design the offer — what makes this burn worth doing, rarity tiers, FCFS vs. raffle mechanics
- **Adapter:** claude_local

#### Campaign Manager
- **Mission:** All holder-facing content for Burn Island — hype, countdowns, recaps, Discord/X/email copy
- **Direct reports:** Scheduler, Copywriter, Graphics Designer
- **Key responsibilities:**
  - Own the Burn Island Banter content calendar
  - Coordinate content production across reports
  - QA all copy before it goes to Director for approval
- **Adapter:** claude_local

#### Scheduler (reports to Campaign Manager)
- **Mission:** Own the content calendar — dates, deadlines, post timing, channel routing
- **Adapter:** claude_local

#### Copywriter (reports to Campaign Manager)
- **Mission:** Write all copy — hype posts, countdowns, weekly burn reports, recaps
- **Voice:** Collector-coded, volcanic, short. No exclamation points. Character names always.
- **Adapter:** claude_local

#### Graphics Designer (reports to Campaign Manager)
- **Mission:** Produce visual assets — countdown images, weekly report composites, event graphics
- **Adapter:** claude_local

#### Sentiment Monitor
- **Mission:** Track community signals — burn questions, complaints, first-timer friction, demand patterns
- **Key responsibilities:**
  - Monitor Discord for holder feedback
  - Track BOOK GAMES supply and burn velocity
  - Surface demand signals to Director before each event
- **Adapter:** claude_local

#### Fulfillment Manager
- **Mission:** Track the physical side — winner notifications, Shopify ghost PDP flow, shipping
- **Direct reports:** Order Tracker
- **Key responsibilities:**
  - Monitor winner communication flow
  - Flag Shopify/SKU swap failures
  - Report fulfillment completion rate per eruption
- **Adapter:** claude_local

#### Order Tracker (reports to Fulfillment Manager)
- **Mission:** Track individual winner orders end-to-end — email sent → cart filled → shipped → delivered
- **Adapter:** claude_local

---

## Phase 2 Expansion (after first cycle validates the core)

If the 5-agent org runs one full eruption cleanly, consider adding:

- **📸 Visual Producer** — Generate eruption imagery, countdown graphics, Banter visuals (currently Watson/CC handles this ad hoc)
- **📚 KB Correspondent** — Distill each eruption's learnings back into the Burn Island knowledge base (feeds DoDo)

---

## Watson ↔ Burn Island Co. Integration Design

**Flow:**
1. Watson receives Burn Island task from Jeremy (or identifies proactively from calendar/cron)
2. Watson → Ignition Director via Paperclip HTTP adapter: "Plan eruption for [date], inventory: [X]"
3. Ignition Director orchestrates the org, distributes sub-tasks
4. Deliverables return to Watson: event brief, content drafts, holder intel report
5. Watson surfaces to Jeremy for approval on anything requiring sign-off (T3)
6. Watson emits `task_complete` to bus; logs to daily memory

**Bus integration (V2):** When ready, add Paperclip event webhook → `emit-event.sh` bridge so every eruption milestone emits to Watson's bus. Not day-one — build after first cycle.

---

## What to Do Next

1. **Install Paperclip locally** — `npm install -g paperclipai` or clone repo. Confirm it runs at `localhost:3100`
2. **Create the company:** "Burn Island Ops Co." in Paperclip UI
3. **Create the 5 agents** with role definitions above as their `capabilities` + system prompt
4. **Feed context:** Import Burn Island section of VeeFriends KB as each agent's knowledge context
5. **Run first task:** Have Ignition Director plan the next eruption after MegaHeads
6. **Evaluate:** Did the structured delegation produce better/faster output than a single-agent approach?

**First real test case:** MegaHeads burn window opens April 7. Ignition Director should own the post-launch weekly report cadence (already specced in `megaheads-burn-countdown-bot-spec.md`).

---

*Source files: `analysis/investigations/paperclip-research-technical.md`, `projects/veefriends-kb/domain/VEEFRIENDS-NFT-KNOWLEDGE.md`, `data/megaheads-burn-countdown-bot-spec.md`, `memory/digests/granola-2026-03-23.md`*
