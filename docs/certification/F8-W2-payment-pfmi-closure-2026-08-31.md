# F8-W2 — Payment Systems / PFMI Oversight Closure

**Date:** 2026-08-31
**Final evidence HEAD:** `b12daea24efd8745e8a2a6da2140dcce276535e6` (clean, 1,314 migrations)
**Gap closed:** GAP-F8-10 — PFMI/payment-systems oversight unexercised

## 1. Scope and wave evidence

Original GAP-F8-10 requirement (F8 discovery, 2026-08-29): *"PFMI/payment-systems oversight unexercised — 1 operator, 0 incidents/volumes — prove incident record/resolve and PFMI assessment end-to-end."* Documented FRD scope: PRU-PAY-001 / IT-097 — operator register, PFMI dashboard/assessment wizard, incidents, oversight events.

### W2A — Payment incident lifecycle — PASS
Implementation HEAD `c78d6a5944d670d21e06b71c32ab01207cae6311`.
Recovered existing contract: `payment_system_operators`, `payment_system_incidents`, `payment_oversight_events`, `payment_oversight_config` (`incident_notification_hours=2`), RPCs `payment_incident_record` / `payment_incident_resolve`, payment-oversight authority helpers, authenticated-only RLS.
Rollback-scoped gate `scripts/verify-f8-w2a-payment-incidents.sql` — **18/18 PASS** at evidence HEAD:
incident record with correct operator linkage, type/severity/timestamps and affected transaction/value fields; configured SLA calculation and late-notification behaviour; canonical incident read surface; oversight event; resolution with notes/time; duplicate resolution rejected; unauthorised internal / external / anonymous callers denied; cross-operator isolation.
No product defects found.

### W2B — PFMI assessment lifecycle — PASS
Implementation HEAD `3498bfd5eb05443367c45f0c27fbc2dcf9098782`.
Recovered single existing workflow: 24-principle catalogue, `pfmi_principle_applicability` (119 rows / 8 operator types), `pfmi_start_assessment`, `pfmi_save_principle`, `pfmi_complete_assessment`, authority helpers, authenticated-only RLS, oversight events, canonical `pfmi_principle_saved` audit, existing UI wizard/panels.
Rollback-scoped gate `scripts/verify-f8-w2b-pfmi-assessment.sql` — **24/24 PASS** at evidence HEAD:
authorised start (`PFMI-2026-0002`); concurrent-assessment rejection; applicable-principle rows generated only from catalogue/applicability rules; non-applicable principles not required; self/regulatory scores, narrative, evidence persist; invalid scores rejected; completed assessments immutable; completion blocked until all required principles assessed; completion succeeded using the **existing worst-observed-score methodology** (17 observed + 1 broadly_observed → `broadly_observed`); status/completed_at/actor/summary/rating recorded; operator `last_pfmi_assessment_date` / `pfmi_compliance_level` updated; authorisation/isolation matrix; `pfmi_save_principle` re-confirmed under the W1E2A canonical audit contract; UI read models read completed results without error.
No product defects found (one gate assertion corrected to respect RLS-hidden audit surfaces).

### W2C — Retail payment volume oversight — PASS
Implementation HEAD `1ee462526040d3a6a60aa6317dc1c2a46317082d`.
Recovered `payment_retail_volumes` (unique operator/period/payment-type key), `useRetailVolumes`, `useSaveRetailVolume`, `RetailPaymentsPanel`.
**Defects found and fixed (smallest durable corrections):**
1. Direct browser UPSERT was a `GOVERNANCE_DEFECT`: client-supplied actor, incomplete DB validation, no governed audit/event evidence. Fixed by introducing canonical governed writer `payment_retail_volume_record(...)` (SECURITY DEFINER, `search_path=public`): payment-oversight authority check, actor derived from `auth.uid()`, DB-enforced validation (period order, non-negative count/value, currency, payment type), existing upsert semantics and row identity preserved, `payment_oversight_events` emission, `prudential_audit_event` dual-surface audit. Client table DML revoked; reads/RLS preserved.
2. UI aggregation summed mixed currencies into a misleading single value. Fixed by grouping value totals by currency in `RetailPaymentsPanel.tsx`.
Rollback-scoped gate `scripts/verify-f8-w2c-retail-volumes.sql` — **15/15 PASS** at evidence HEAD, real certification personas, no `auth.users` seeding: validation, upsert/correction semantics, authorisation/isolation, UI read and currency-safe aggregation, oversight events, dual-surface audit.

## 2. Security posture

- Payment-oversight authority (`R-10` supervisor; read for authorised roles) enforced server-side in all governed RPCs.
- Authenticated-only RLS preserved; client DML on `payment_retail_volumes` revoked in favour of the governed writer.
- Actor is server-derived (`auth.uid()`); no caller-supplied ownership accepted.
- Unauthorised internal, external licensee, and anonymous callers denied; cross-operator isolation proven in all three gates.
- Canonical evidence: `payment_oversight_events` + `prudential_audit_event` dual-write (`audit_logs` operational, `compliance_audit_logs` regulatory).
- Regressions at closure: W1C 20/20, W1E2A 12/12, W1E2B 13/13, W2A 18/18, W2B 24/24, relevant payment/PFMI/prudential tests 41/41, typecheck clean, build green.

## 3. GAP-F8-10 closure rationale

The original requirement — prove incident record/resolve and PFMI assessment end-to-end — is fully proven, and the retail-volume surface is additionally governed and certified. Required capability under PRU-PAY-001 is demonstrated with rollback-scoped, persona-real evidence. **GAP-F8-10 = CLOSED.**

## 4. Non-blocking residuals (recorded, not blockers, not implemented)

| Residual | Classification | Rationale |
|---|---|---|
| PFMI assessment frequency (`pfmi_assessment_frequency_months`) | **BCR / REGULATOR POLICY** | Config value exists (default 12) but no approved requirement mandates automatic next-due-date calculation, frequency-based blocking, overdue alerts, or scheduling. No RPC consumes it for enforcement. |
| Incident → supervisory-action linkage (`linked_action_id`) | **OPTIONAL CROSS-MODULE INTEGRATION** | Nullable, unwired column; no approved requirement makes incident-to-prudential-action linkage mandatory. The documented incident lifecycle (record → SLA → resolve) is complete without it. |

## 5. Verdict

**F8 PAYMENT SYSTEMS / PFMI OVERSIGHT — CERTIFIED** at HEAD `b12daea24efd8745e8a2a6da2140dcce276535e6`.
