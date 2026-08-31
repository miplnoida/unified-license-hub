# F8-W1E — Prudential Audit Coverage Closure (GAP-F8-02)

Date: 2026-08-31
Implementation HEAD (W1E2B, tested): `4332c12e3`
Final evidence HEAD (this closure): see footer of latest gate run; no Prudential product code changed after W1E2B.

## Final 60-RPC audit census

| Classification | Count | Mechanism |
|---|---|---|
| Canonical audit | 39 | `prudential_audit_event(...)` — governed user mutations |
| Domain-event canonical evidence | 11 | Append-only domain event/version ledgers, classified `CANONICAL_SURFACE_SUFFICIENT` |
| Ratified system audit exceptions | 2 | `_prudential_canonical_detect_run`, `group_ewi_evaluate` — system/derived audit writers, not user-governed mutations |
| Derived/system operations | 8 | Deterministic calculations, ingestion telemetry, scheduler/trigger housekeeping — outside governed-mutation audit requirements |
| **NOT_AUDITED** | **0** | — |
| **UNCLEAR** | **0** | — |

## Canonical audit contract

`prudential_audit_event(_action text, _entity_type text, _entity_id uuid, _before jsonb, _after jsonb, _context jsonb, _justification text, _compliance_action compliance_audit_action)`:

- `SECURITY DEFINER`, pinned `search_path = 'public'`, actor derived from `auth.uid()` — never caller-supplied.
- **Intentional dual-write (ratified, not accidental):**
  - `audit_logs` = operational audit surface (who/what/when on the object).
  - `compliance_audit_logs` = regulatory/compliance audit surface (action classification, justification, before/after, `domain='prudential'` metadata).
- Converged in W1E2B: 13 RPCs moved from direct `log_compliance_audit` to `prudential_audit_event` with signatures, return shapes, authority checks, validation, event names, and before/after state preserved. Repaired in W1E2A: `examination_team_member_add/update/end`, `pfmi_save_principle`.

## Ratified system audit exceptions (2)

- `_prudential_canonical_detect_run` — detection engine bookkeeping.
- `group_ewi_evaluate` — derived group EWI evaluation output.

## Domain-event-ledger cases (11)

Eleven governed mutations whose append-only domain event/version ledgers (examination events, prudential action events, payment oversight events, version ledgers) are the canonical evidence surface — classified `CANONICAL_SURFACE_SUFFICIENT`; not forced through a second audit mechanism.

## Derived/system operations (8)

`evaluate_stress_indicators_for_filing`, `record_return_breach`, `recompute_return_ratios`, `mark_prudential_actions_overdue`, `prudential_feed_log_record`, `auto_seed_supervisory_plan`, `bootstrap_supervisory_profile`, `examination_set_reference` — classified `DERIVED/SYSTEM_OPERATION`; outside governed-mutation audit requirements.

## Security posture

Unchanged. No permission, RLS, grant, signature, or return-shape changes in W1E2A/W1E2B; authorisation denial checks remain green.

## Gate results

- `verify:f8-w1e2a-audit-mutations` — PASS (12/12)
- `verify:f8-w1e2b-audit-convergence` — PASS (13/13)
- Regressions: W1A, W1B, W1C, W1D gates + typecheck + build — PASS (W1E2B turn)
- Final closure re-run: W1E2A, W1E2B, W1C, W1D — see closure evidence run.

**GAP-F8-02: CLOSED.**
