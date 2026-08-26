# MC-07 — Conduct 360 + Governed AI (design contract)

## A. MC-07 purpose

Give a supervisor one entity-level Conduct 360 view that assembles what already exists across MC-00–MC-06 — complaints and outcomes, conduct signals, deterministic patterns/clusters, conduct alerts, entity/product/channel/sector context and existing conduct risk information — and add an AI advisory layer that helps a supervisor read that picture faster.

Two strictly separated layers:

1. **Fact layer** — server-authoritative, deterministic, reproducible. Counts, trends, rule outputs, statuses, timestamps. No AI involvement.
2. **AI advisory layer** — narrative assistance only. It never becomes a record of regulatory truth, never mutates a fact object, and always carries provenance plus a human review status.

The human decision remains the only authoritative decision in the module.

## B. Conduct 360 fact sections

All read-only, all derived from existing tables through governed read models.

1. **Entity header** — entity name and registration context, sector/sub-sector, licence status, portfolio owner, review window selector.
2. **Conduct posture summary** — open complaints, complaints closed in window, upheld/partially upheld share, redress ordered and paid, open signals, confirmed patterns, open alerts, overdue SLA items.
3. **Complaints & outcomes** — complaint list with reference, category, severity, status, SLA state, outcome and redress; volumes by category and by month.
4. **Conduct signals** — signal register scoped to the entity: reference, source, category, severity, systemic potential, lifecycle status.
5. **Deterministic patterns** — clusters that include this entity: rule and rule version, measure, measured value vs threshold, window, review status, contributing record counts.
6. **Alerts** — alert kind, severity, origin (triage / thematic sweep / pattern / SLA), status, linked pattern or complaint.
7. **Product / channel view** — the same volumes broken down by product and distribution channel where those references exist.
8. **Sector comparison** — entity value against sector peer values for the same measures, deterministic arithmetic only.
9. **Conduct risk information** — existing conduct risk categories/ratings and their last human review, plus prudential/CAMELS cross-reference where already recorded.
10. **What changed in this window** — deterministic diff: new complaints, new signals, newly confirmed patterns, severity escalations, new alerts, closed items.
11. **Supervisory record** — existing supervision annotations, review notes, and the human decision log for the entity.

Every fact tile states its measure, window and source module so it can be traced.

## C. AI advisory features

Each is a separate advisory type, generated on request (never automatically on page load), from the fact layer only:

1. **Conduct picture summary** — plain-language narrative of the entity's current conduct position.
2. **Change explanation** — narrative reading of the deterministic "what changed" diff.
3. **Records to review** — a shortlist of complaints / signals / patterns worth a supervisor's attention, each item pointing at a real record reference.
4. **Suggested supervisory questions** — questions the supervisor could put to the entity.
5. **Risk hypothesis** — a possible explanation of the pattern of behaviour, explicitly labelled as a hypothesis with uncertainty stated.

Advisory outputs are labelled "AI suggestion — not a regulatory decision", carry references to the exact source records used, and are empty-stated when the fact layer has too little data to support them.

## D. AI prohibited actions

AI must never:

- change or propose a committed change to a conduct risk rating
- validate, dismiss or otherwise transition a signal
- confirm, dismiss or re-run a deterministic pattern
- open an investigation or an investigation plan
- create a conduct finding
- initiate or recommend commencement of enforcement
- close, uphold or reject a complaint
- issue an outcome, redress instruction or letter
- make any regulatory decision, or write to any fact table

Enforcement is structural, not just prompt-level: AI output lands in an advisory store only, the generation path holds no write privilege on any conduct fact object, and every fact mutation continues to run through the existing MC-01–MC-06 governed operations that require a human actor and permission.

## E. Human control model

- Every advisory item starts as **Not reviewed**.
- A supervisor sets **Accepted**, **Modified** or **Rejected**. Modified stores the supervisor's edited text alongside the original AI text; the original is never overwritten.
- Accepting an advisory item does not perform any action. It records agreement only.
- Acting on an advisory item is always a separate, explicit governed operation (raise signal, review pattern, open investigation, record outcome) performed by the human with their own permission check and their own rationale.
- Where a human action is taken after reading an advisory item, the link is recorded as "informed by", not "caused by".
- Reviewer identity, reviewer reason and review timestamp are mandatory for Modified and Rejected, and captured for Accepted.
- Auditor personas can read the advisory layer and its review history and can write nothing.
- Out-of-scope entities are unreadable, matching the existing regulator/portfolio scope guard.

## F. Provenance and audit model

Each advisory item persists:

- advisory type, entity, regulator, review window, generated text (and modified text when present)
- source references: the exact record ids/references and measures fed to the model
- input fingerprint (deterministic hash of the fact snapshot) so a stale advisory is detectable when facts move
- generated timestamp and generating user
- model id and model version, provider, provider state
- prompt template id and template version
- confidence / uncertainty statement where the advisory type warrants one
- human status, reviewer, reviewer reason, review timestamp
- append-only history of every state change (generated, viewed, accepted, modified, rejected, superseded)

Stale advisories are marked "facts have changed since generation" rather than silently refreshed. Nothing is deleted; regeneration supersedes.

## G. Minimal backend objects needed

Reuse before adding: `ai_insights` and `ai_insight_actions` already carry module, entity, object, source records, citations, provider, model, confidence, explanation, recommendation, review status, reviewer, generated_at, input fingerprint and payload. MC-07 extends rather than replaces them.

- **Read model**: one governed read function returning the full Conduct 360 fact snapshot for an entity and window, plus small per-section functions for the heavier lists (complaints, signals, patterns, alerts) so the page can page them.
- **Peer comparison read model**: sector aggregate measures for the same window.
- **Advisory store**: add the missing provenance columns to the existing advisory table — prompt template id and version, modified text, reviewer reason, staleness flag/fingerprint at review time, advisory subtype for the five MC-07 types.
- **Advisory history table**: append-only state transitions per advisory item.
- **Governed operations**: generate advisory (permissioned, rate-limited, scope-guarded); record advisory review (accept/modify/reject with mandatory reason on modify/reject); link advisory to a human action already taken.
- **Guards**: no browser write access to fact tables or the advisory store; advisory generation and review only via the governed operations; scope guard reused from MC-05/MC-06; audit log entries for generate and review.
- **AI call boundary**: one edge function that reads the fact snapshot server-side, calls Lovable AI, and writes only into the advisory store. No client-supplied facts, no client-supplied prompts, gateway errors surfaced (only 429/5xx retried with backoff).

## H. Minimal UI needed

- **Conduct 360 entity view** under Market Conduct, reached from the entity, from a complaint, from a signal and from a pattern.
- Layout: entity header and window selector, posture summary tiles, "what changed" strip, then tabbed fact sections (Complaints & outcomes, Signals, Patterns, Alerts, Product/channel, Peer comparison, Conduct risk, Supervisory record).
- **Advisory panel** alongside the facts: generate control per advisory type, generated content with its source references as clickable chips, provenance footer (model, template version, generated time, confidence), and Accept / Modify / Reject with reason.
- **Advisory history** view per item.
- Business language only, no identifiers or internal enum names on screen; auditor sees the same screens with all controls absent.

### Visible distinction of the four content classes

Each block on screen is labelled and styled distinctly, and the legend is always visible:

```text
FACT                 grey/neutral tile, label "Recorded", shows measure + window + source
DETERMINISTIC RULE   blue tile, label "Rule outcome", shows rule + version + threshold + measured value
AI SUGGESTION        amber tile, dashed border, label "AI suggestion - not a decision",
                     always with model/template/time + source chips + review status chip
HUMAN DECISION       green tile, label "Decision", shows decision, actor, timestamp, rationale
```

No advisory content is ever rendered inside a fact or decision tile, and no decision is ever pre-filled from advisory text without the supervisor typing or confirming it.

## I. Proposed demo journey

1. Open an entity with real complaint, signal, pattern and alert history; show the Conduct 360 facts and the "what changed" strip, with the legend visible.
2. Point out a deterministic pattern tile: rule, version, measured value vs threshold — no AI involved.
3. Generate the conduct picture summary and the change explanation; show the amber labelling, source chips resolving to real records, and the provenance footer.
4. Generate "records to review" and "suggested supervisory questions"; open one referenced complaint from a chip.
5. Generate the risk hypothesis; show the uncertainty statement.
6. Accept one advisory item, modify a second (original preserved side by side), reject a third with a reason; show the history trail.
7. Attempt an AI-driven action to show it does not exist: no control anywhere lets AI change a rating, confirm a pattern, open an investigation or close a complaint.
8. Perform the equivalent human action through the existing governed operation, with the human's own rationale, and show it appear as a green decision tile linked as "informed by" the advisory item.
9. Switch to the auditor persona: everything readable, nothing generatable, nothing reviewable.
10. Change an underlying fact and reload: the advisory item is flagged stale rather than silently updated.

## J. Recommended MC-07 build sequence

1. **MC-07.1 Fact layer backend** — Conduct 360 read models, peer comparison, change diff, scope guards, tests.
2. **MC-07.2 Fact layer UI** — Conduct 360 view with all fact sections and the four-class legend, no AI present.
3. **MC-07.3 Advisory store & governance** — advisory columns, history table, generate/review/link operations, permissions, audit, tests.
4. **MC-07.4 AI generation boundary** — edge function, prompt templates with versions, the five advisory types, error semantics.
5. **MC-07.5 Advisory UI** — advisory panel, provenance footer, review controls, history, staleness.
6. **MC-07.6 Certification** — authenticated runtime scenarios covering fact accuracy, prohibited-action absence, provenance completeness, review states, staleness, scope denial, auditor read-only, and no auto-creation of any fact record.

Each sub-phase stays backend-then-UI-then-certification, matching MC-05 and MC-06.
