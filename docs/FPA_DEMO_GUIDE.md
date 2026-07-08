# Fit & Proper Module — Client Demo Guide

This walks through how to demonstrate four Fit & Proper (FPA) capabilities to a
client, following the demo scenarios you defined:

1. AI-Assisted Data Analysis (with Human Override of AI Output)
2. Sector-Specific Decision Logic
3. Multi-Regulator Determinations
4. Conditional Determination & SLA Breach

Each section below tells you: what to set up beforehand, the exact click-path
to run live, and — critically — where the "Evidence Required" from your
original requirements table actually lives on screen, so you can point at it
directly instead of describing it.

> Scenario "Committee Review & Weighted Voting" (`/fpa/committee`) is not
> covered here — it wasn't part of this round of fixes and hasn't been
> re-verified against the same rigor as the four below.

---

## Before you start: one-time setup

A few things are worth configuring once, ahead of the demo, so the live
walkthrough is smooth:

1. **Create at least one Sector Decision Rule.** Go to `/fpa/sector-rules` →
   **Add Rule**. Pick a sector (e.g. "Banking"), leave sub-sector/role type
   as "Any" for a broad demo rule, and set:
   - Mandatory Checks: `criminal_history`
   - Disqualifiers: `sanctions`
   - Description: something client-readable, e.g. "Banking sector requires a
     clean criminal history check; any sanctions hit is an automatic
     disqualifier."

   This is the rule the Determinations screen will evaluate against live.

2. **Assign two staff members to two different regulators.** Go to
   `/admin/users` (Employee Management) → open a staff member's **Edit
   profile** → set **Regulator** (e.g. "Central Bank"). Repeat for a second
   staff member with a different regulator (e.g. "Securities Commission").
   This is what makes the segregation part of the Multi-Regulator scenario
   demonstrable — without it, every staff member sees everything.

3. **Have one assessment ready with AI findings.** The easiest path: on
   `/fpa/screening`, run a screening (or AI media scan) against an existing
   individual/assessment so `/fpa/ai-analysis` has real findings to show.
   Any assessment that's been through screening already qualifies.

---

## 1 — AI-Assisted Data Analysis (with Human Override)

**Route:** `/fpa/ai-analysis`

### What to show

| Requirement | Where it is |
|---|---|
| AI-generated summaries | Each finding card's body text |
| Source citations | "Citations" list on each finding card |
| Confidence indications | The colored "HIGH/MED/LOW CONF · N%" badge on each finding |
| Inconsistency flags | Amber "Inconsistency detected" banner (see below) |
| Human override with audit trail | The **Override** button + dialog |
| Final assessment reflects human decision | Explained during the walkthrough (see step 5) |
| AI output logs / data sources referenced | The **Screening Run Log** card at the top of the page |

### Script

1. Open `/fpa/ai-analysis`, select the prepared assessment from the dropdown
   at the top.
2. Point out the **Screening Run Log** card: run type, status, checks run,
   hits, and the list of "data sources / screening processes" used in that
   run. This is the durable log of what actually ran — say explicitly that
   this is stored per-run and doesn't disappear after the fact.
3. Walk through a finding card: title, AI summary, confidence badge,
   citations. If the confidence badge doesn't already look right, note that
   it now reads as a true percentage (e.g. "HIGH CONF · 85%") — this was a
   display bug that's now fixed.
4. If a finding's check type has a matching self-declaration answer (criminal
   history, regulator watchlist, credit history, or PEP-type findings), and
   the individual answered "No" on their declaration, you'll see an amber
   **"Inconsistency detected"** banner on that finding — this is the system
   catching a contradiction between what was self-declared and what
   screening/AI actually found.
5. Click **Override** on a finding. Choose a decision (e.g. "False
   Positive"), type a reason (required), submit. Then show:
   - The finding card now shows an **"Overridden"** badge and the reviewer's
     name, reason, and timestamp.
   - Override it a second time with a different decision, and expand
     **"N prior overrides"** — the full history is preserved, not
     overwritten. This is your audit trail: nothing about a past decision is
     lost when a new one is made.
6. Explain (no need to click anything further): overridden findings marked
   "False Positive" are excluded when a sector rule is evaluated on the
   Determinations screen — the human call, not the raw AI output, feeds the
   final decision. You'll show this concretely in Scenario 2.

---

## 2 — Sector-Specific Decision Logic

**Routes:** `/fpa/sector-rules` (configure) → `/fpa/determinations` (apply)

### What to show

| Requirement | Where it is |
|---|---|
| Configure sector-specific rules | `/fpa/sector-rules` — Add/Edit Rule dialog |
| Apply sector-specific rules | `/fpa/determinations` — the sector rule card inside "New Determination" |
| Decision rationale tailored to sector | The pass/fail card + the rationale requirement when a rule fails |

### Script

1. On `/fpa/sector-rules`, show the rule created in setup — point out the
   **Criteria Summary** column and expand the row to show the full JSON.
   Explain the fields plainly: mandatory checks, disqualifiers, warnings, and
   optionally a minimum confidence score.
2. Move to `/fpa/determinations` → **New Determination**. Pick the individual
   and assessment tied to that sector/rule.
3. As soon as the assessment is selected, the **sector rule card** appears
   automatically:
   - If the individual's active findings satisfy the rule → green "All
     sector criteria satisfied."
   - If not (e.g. a disqualifying sanctions finding is still active, or the
     mandatory criminal history check never ran) → red card listing exactly
     what's missing/disqualifying.
4. This is the moment to tie back to Scenario 1: if you overrode a
   disqualifying finding as "False Positive" earlier, show that the rule now
   passes — the sector logic is reading the human decision, not the raw AI
   flag.
5. If the rule fails, try to submit with a short rationale — the system
   requires at least 10 characters and the placeholder text explicitly says
   "must justify overriding the sector rule." Submit with a real
   justification to complete the determination.

---

## 3 — Multi-Regulator Determinations

**Route:** `/fpa/determinations`

### What to show

| Requirement | Where it is |
|---|---|
| Independent determinations per regulator | Regulator field auto-filled from the assessment; comparison view |
| Decision records per regulator | List view's Regulator column + filter |
| Access logs | "Access Log" section inside the determination detail dialog |
| Regulatory segregation / independent decision-making | Log in as two staff assigned to different regulators |

### Script

1. Record a determination for an individual whose assessment is tied to
   Regulator A (the regulator shows as a read-only "from assessment" field —
   not something a user can misspell or fat-finger).
2. Record a **second** determination for the **same individual** on an
   assessment tied to Regulator B, with a different outcome. This does not
   overwrite the first — both stay "current" independently, one per
   regulator.
3. Switch to **Comparison View**. The individual now appears with a
   **"CONFLICTING DETERMINATIONS"** banner, showing both regulators' outcomes
   side by side with resolved regulator names (not raw IDs).
4. Back in **List View**, use the new **regulator filter** to show only
   Regulator A's determinations, then only Regulator B's.
5. Click **View** on a determination to open the detail dialog, and scroll to
   **Access Log** — every time this dialog is opened, it's logged (actor +
   timestamp), alongside the original "recorded" entry. This is your access
   trail.
6. **Segregation, concretely:** log in as (or switch to) the staff member
   assigned to Regulator A in setup. On `/fpa/determinations`, they only see
   Regulator A's determinations for that individual — Regulator B's row is
   invisible to them entirely, not just visually filtered. Repeat with the
   Regulator B staff member to show the reverse. A `super_admin` account
   still sees both, which is worth calling out as the intended oversight
   exception.

---

## 4 — Conditional Determination & SLA Breach

**Route:** `/fpa/conditions`

### What to show

| Requirement | Where it is |
|---|---|
| Set a condition | **Add Condition** dialog |
| Track reminders | "Reminded" indicator under the due date; **Remind** action |
| SLA breach detected & logged | **Run Sweep Now**, the OVERDUE badge, the **History** dialog |
| Enforceability | The automatic 6-hourly schedule (mention it explicitly — see below) |

### Script

1. **Add Condition** for an individual with a determination already on file.
   For a fast demo, set the due date to **yesterday** (the date picker
   normally prevents past dates for new conditions going forward, but a due
   date can also be set for something already due to immediately show
   breach behavior — otherwise use "today" and rely on the sweep's overdue
   detection which triggers once the due date has passed).
2. Click **Run Sweep Now** (top right). This runs the same automatic job that
   is scheduled to run every 6 hours in the background — say this explicitly:
   *"This isn't a demo-only shortcut, it's the exact same job that runs
   unattended around the clock; the button just lets us see it fire
   immediately instead of waiting."*
3. After the sweep completes (toast shows a summary), refresh and show:
   - The condition now has a red **OVERDUE** badge with days-overdue count.
   - The **SLA Breach %** stat card reflects it.
4. Click the **History** icon on that condition's row — this opens the
   breach/reminder log pulled from the monitoring events table: a BREACH
   entry with a timestamp, separate from a REMINDER entry if the due date
   was within the 7-day reminder window instead of already passed.
5. To show the reminder path specifically: add a condition due a few days
   out, click **Remind** on its row — this logs a reminder immediately (same
   effect as the scheduled sweep catching it inside the 7-day window) and
   stamps "Reminded [date]" under the due date.
6. Finally, click **Mark Satisfied** or **Waive** on an open condition to
   show the resolution step of the lifecycle, completing the full cycle:
   set → tracked → reminded → (breached) → resolved.

---

## Notes for whoever is running the demo

- Every fix in this round was verified with a full TypeScript type-check, a
  production build, and the existing automated test suite (471 tests) — all
  passing. What has **not** been done is a live click-through in a browser
  against a running Supabase instance, since that wasn't possible in the
  environment this work was done in. Do one full run-through of all four
  scripts above yourself before presenting to the client.
- The "Run Sweep Now" and "Remind" buttons exist specifically so the
  Conditions & SLA scenario doesn't require waiting for the real 6-hourly
  schedule during a live demo — but the schedule is real and running
  independently of the demo.
- If a rule you configure on `/fpa/sector-rules` doesn't seem to affect a
  determination, double check the rule's **Sector** (and Sub-Sector/Role Type
  if set) actually matches the individual's role/licensee — the match is
  exact, not fuzzy.
