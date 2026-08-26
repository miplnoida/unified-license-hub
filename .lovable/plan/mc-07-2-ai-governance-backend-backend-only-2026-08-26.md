# MC-07.2 — AI Governance Backend (backend only)

Build the governance rails that a future Conduct 360 AI advisory layer must pass through. No model is called, no narrative is generated, no UI is built. `conduct_360_snapshot` stays unchanged.

## What already exists (verified)

- `ai_insights` already stores module, entity, source records, citations, provider/model, confidence, input fingerprint, structured payload, generated timestamp, regulator, and a review status; `ai_insight_actions` is its action log with `actor_id`, and `ai_insight_review` is the existing governed review RPC.
- Its vocabulary is the older platform one (`pending / accepted / dismissed / escalated / overridden`) and it has no notion of use cases, snapshot window, staleness, limitations, or the MC-07 review states. So MC-07 reuses this store as the insight record and adds a thin conduct-specific governance layer beside it, rather than a second intelligence store.

## 1. Approved use-case register

New config table `conduct_ai_use_cases`, seeded with exactly five codes and nothing else:

| code | purpose |
| --- | --- |
| `SUPERVISORY_SUMMARY` | plain-language summary of the 360 facts |
| `MATERIAL_CHANGE_EXPLANATION` | explains window-on-window movement |
| `RECORDS_TO_REVIEW` | suggests which existing records a supervisor should open |
| `SUPERVISORY_QUESTIONS` | suggests questions to put to the entity |
| `RISK_HYPOTHESIS` | suggests a possible risk explanation to test |

Each row configures: governance level, enabled flag, allowed source (locked to `conduct_360_snapshot`), human review required, citations required, workflow mutation allowed (forced `false`), allowed and prohibited output classes, prompt/template code and version, model/provider policy, confidence and limitation policy. Database-level checks pin the non-negotiables: source can only be the snapshot, mutation-allowed can only be false, review and citations required cannot be turned off, and the code must be one of the five.

## 2. Insight provenance record

New table `conduct_ai_insights` (one row per generated advisory item, linked to `ai_insights` so the platform insight store remains the single intelligence store): use case, entity, snapshot window start/end, snapshot fingerprint, source references, model/provider/version, prompt template code + version, generated timestamp, structured output, confidence and uncertainty, stated limitations, staleness state (`CURRENT` / `STALE`), and review state.

Review states: `NOT_REVIEWED`, `ACCEPTED`, `MODIFIED`, `REJECTED`, `SUPERSEDED`.

The original AI output column is immutable — a trigger blocks any change to the generated output, fingerprint, model, prompt version, or generated timestamp after insert. Human edits live in separate "human output" columns, so the AI original is preserved permanently.

Staleness is derived, not guessed: re-computing the snapshot fingerprint for the same entity and window and comparing it to the stored fingerprint marks the insight stale.

## 3. Human review operations

Append-only history table `conduct_ai_review_events` (no update/delete permitted, enforced by trigger) plus one governed RPC `conduct_ai_insight_review(insight, action, rationale, human_output)` supporting exactly four actions:

- `accept` — rationale optional
- `modify` — rationale mandatory, human output mandatory
- `reject` — rationale mandatory
- `supersede` — marks the earlier insight superseded when a newer one for the same entity/window/use case is accepted

Every call records actor, action, rationale, before/after review state and timestamp. Decisions are recorded as "informed by" the advisory item; the RPC cannot touch any supervisory object.

## 4. Structural prohibition

The AI layer gets no generic mutation or action executor. There is deliberately no `mutation_spec`, no target-table column, no dynamic SQL, and no call from any AI-layer function into the conduct decision RPCs (risk rating, signal validate/dismiss, pattern confirm, alert raise, investigation open, finding create, enforcement action, complaint outcome, workflow transition). Enforced three ways: the review RPC writes only to the two AI tables; a check constraint forbids mutation-allowed use cases; and a test asserts no AI-layer function body references any conduct mutation RPC.

## 5. Context operation for future generation

One read RPC `conduct_360_ai_context(entity, window_start, window_end)` returning the unmodified `conduct_360_snapshot` payload plus the computed input fingerprint plus the permitted source-reference list and the resolved use-case governance config. This is the only sanctioned input for future AI generation; it calls no model.

## 6. Security

Regulator + ROS scope and market-conduct permission reused from MC-07.1; auditors read but cannot review; `anon` gets no execute and no table grants; the review and record RPCs are `SECURITY DEFINER` with pinned `search_path`, and the insight tables carry no direct-write grants for `authenticated`, so all writes go through the governed RPCs. Review history is append-only.

## 7. Targeted tests

New `supabase/tests/conduct/07_ai_governance.sql` covering: the five use cases exist with locked governance flags; source cannot be anything but the snapshot and mutation-allowed cannot be true; an insight preserves the full provenance set; original output is immutable after modify; the four review actions behave correctly and rationale is mandatory for modify/reject; supersede works; review history is append-only; context RPC returns snapshot + fingerprint + references and matches the snapshot; staleness flips when the underlying facts change; out-of-scope and anonymous review denied; auditor read-only; no AI-layer function references any conduct mutation RPC.

## Deliverable answers on completion

A. complete YES/NO — B. objects reused/added — C. use-case governance model — D. provenance/fingerprint model — E. human review operations — F. prohibited-action enforcement — G. security — H. tests — I. blocker.

MC-07.3 will not be started.
