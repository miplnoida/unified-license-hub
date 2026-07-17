# Phase 0 — Complaints Module Honest Inventory

**Baseline commit:** `7a72985f4870cb05bbcdc00a11c87d88df39c9e2`
**Mode:** read-only, no code changes in this phase.
**Method:** file/line-level grep of `supabase/migrations/**`, `supabase/functions/**`, `src/**`, and `docs/22_AUDIT_REPORT.md`.

Classification legend:
- **Fixed** — implemented AND we have a verifiable artifact to cite in later phases.
- **Partial** — code exists but a required piece is missing (validation, RLS scope, trigger, RPC, or test).
- **Broken** — code exists but is provably wrong (still swallows errors, still writes hardcoded status, etc.).
- **Missing** — nothing in the codebase implements the requirement.

Nothing in this inventory has been runtime-verified yet — the "verified" column is filled in only in later phases.

## Audit item status

| # | Audit item (short) | Status | Evidence |
|---|---|---|---|
| 1 | Canonical creation RPC (`create_complaint`) | **Partial** | RPC exists — `supabase/migrations/20260716080717_...sql` L1 signature `create_complaint(_payload jsonb) SECURITY DEFINER SET search_path=public`. Missing: variant discriminator (`public / internal / licensee`), server-side stripping of `severity`/`priority` for external variants, and `complaint_intake_rules`-driven required-field validation. |
| 2 | Public Edge Function delegates to the canonical RPC | **Not verified** | `supabase/functions/submit-public-complaint/` exists but its body was not opened in this phase. |
| 3 | Shared Zod schemas + `useCreateComplaint` hook | **Partial** | `src/lib/complaintSchemas.ts` present with `publicComplaintSchema`, `internalComplaintSchema`, `licenseeComplaintSchema`. `NewInternalComplaint.tsx` L18/L88 uses `internalComplaintSchema.safeParse`. Missing: a single `useCreateComplaint` hook consumed by all three intake surfaces (public + licensee still call insert paths that were not inspected here). |
| 4 | Vulnerability consistency enforced by DB trigger | **Missing** | No migration defines `enforce_vulnerability_consistency` or an equivalent trigger. Only client-side refinement in `complaintSchemas.ts` L88. |
| 5 | Licensee search RPC replaces client-side 500-row list | **Missing** | No `CREATE FUNCTION public.search_licensees` in any migration. |
| 6 | Atomic attachment linkage (`finalize_complaint_with_attachments`) | **Missing** | RPC not present in migrations. Current flow lives in `src/lib/complaintAttachments.ts` which iterates uploads then inserts `complaint_evidence` per row from the browser — not transactional. |
| 7 | Cancel / unsaved-changes / duplicate-submit guards on internal intake | **Partial** | Guard behaviour not yet re-verified in this phase; `NewInternalComplaint.tsx` was reported to use these but no assertion here. |
| 8 | Canonical status catalog (`v_complaint_status_catalog`) | **Missing (view)** / **Partial (client)** | View not defined in any migration. `src/lib/complaintStatus.ts` is hand-authored constants including `rejected` and `duplicate`. |
| 9 | No direct `.update({status})` / `.insert()` into `complaints` / `enforcement_*` from React | **Fixed (by grep)** | Grep `rg "from\('complaints'\)" src` returned zero write matches in this phase. Guardrail test `src/test/complaintWorkflowGuardrails.test.ts` L18-L40 uses honest `rg` exit-code handling (0/1/≥2). |
| 10 | Duplicate detection RPCs + hub | **Partial** | `detect_complaint_duplicates`, `decide_duplicate_pair`, `duplicate_hub_stats`, `list_duplicate_clusters`, `pending_duplicate_count` all present in migrations `...20260716074842...sql` and `...20260716080717...sql`. Banner `DuplicateAlertBanner.tsx` still contains `if (!count) return null` at L67 — this is by design (hide when zero) but the same file at L37 also swallows the loading state. No `return null` on the *error* path was found — that path was fixed in the previous slice. |
| 11 | Escalation engine (`run_complaint_escalation_sweep`, `decide_escalation_case`, `simulate_escalation_rule`) | **Partial** | RPCs present in `...20260716074842...sql` and `...20260716080717...sql`. Not yet runtime-verified. `EscalationBanner.tsx` mirrors the duplicate banner pattern. |
| 12 | Public tracking redaction (`get_public_complaint_tracking`) | **Missing** | No such RPC in any migration. `get_complaint_tracking` exists (`...20260716140702...sql`) but is the internal variant. |
| 13 | Notification outbox with `FOR UPDATE SKIP LOCKED` + idempotency | **Partial** | `claim_notification_outbox`, `reap_stuck_notification_outbox`, `retry_dead_notification_outbox` all in `...20260716150703...sql`; two `SKIP LOCKED` clauses present. Missing/unverified: unique idempotency index `(event_key, entity_id, recipient, correlation_id)`, and confirmation that enqueue happens *inside* the `execute_complaint_workflow_action` transaction rather than after commit. |
| 14 | Tightened RLS (no permissive `WITH CHECK (true)`) on `complaints` and related tables | **Not verified** | Requires reading every complaint-table policy across ~30 tables and running an 11-persona matrix — deferred to Phase 6. |
| 15 | Honest guardrail testing | **Fixed** | `src/test/complaintWorkflowGuardrails.test.ts` L18-L40 documents 0/1/≥2 exit-code handling and throws on ≥2. |
| 16 | Automated integration/E2E tests | **Missing** | `supabase/tests/complaints/` does not exist. Existing vitest suites: `complaintSchemas.test.ts`, `complaintWorkflowGuardrails.test.ts`, `complaintsSla.test.ts`, `marketConduct.test.ts` — no SQL integration, no RLS matrix, no Playwright lifecycle. |

## Summary counts

- Fixed: 2 (items 9, 15)
- Partial: 7 (items 1, 3, 7, 10, 11, 13, plus item 8 client-side)
- Missing: 5 (items 4, 5, 6, 12, 16) + item 8 view
- Not verified in this phase: 2 (items 2, 14)

## What must exist before any claim of "Complaints module complete"

Concrete deliverables that Phase 0 has proven are still absent from the repository:

1. Migration creating `complaint_intake_rules` (CREATE → GRANT → RLS ENABLE → POLICY).
2. Migration adding `enforce_vulnerability_consistency` trigger.
3. Migration creating `search_licensees(query, regulator_id, limit, offset)`.
4. Migration creating `finalize_complaint_with_attachments(complaint_id, upload_ids[])`.
5. Migration creating `v_complaint_status_catalog` view + generator script.
6. Migration creating `get_public_complaint_tracking(reference, verification_token)` and adding `approval_steps.public_stage_label` / `public_stage_description` seeds.
7. Migration adding unique idempotency index on `notification_outbox`.
8. Refactor of `create_complaint` to accept a variant and consult `complaint_intake_rules`.
9. `useCreateComplaint` hook + refactors of public and licensee forms to consume it.
10. `supabase/tests/complaints/*.sql` covering create, transitions, RLS matrix, duplicate detection, escalation, outbox concurrency, attachment atomicity, public tracking redaction.
11. Playwright lifecycle harness under `docs/verification/complaints/phaseN/` per approved plan.

## Honesty note

Per the approved plan and the user's completion-criteria rules, none of the "Partial" or "Fixed by grep" rows above may be re-classified higher without a corresponding runtime artifact (SQL test output, Playwright screenshot, or scan log) attached in the phase that produces it. That is deliberate.
