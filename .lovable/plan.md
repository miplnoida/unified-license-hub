# Phase 1 — Final Verification & Gap Closure

Scope: verify and close gaps only in ADM-SLA-001, LIC-DEC-001, LIC-DEC-002, AUD-SEC-001, AUD-OVR-001. No Phase 2 work, no rebuilds of what already exists.

## What inspection already confirmed

Confirmed by reading code and querying the database this turn:

1. **Certificate issuance persists the wrong content (confirmed bug).** In `src/components/applications/DecisionDocumentPreview.tsx` the issuance call sends
   `_rendered_html: artifactType === 'decision_letter' ? letterHtml : (certUrl ? letterHtml : '')`.
   A licence certificate therefore stores the decision-letter HTML, and only if a PDF preview happens to have been generated first. The `preview-decision-documents` function returns a PDF only, so there is currently no certificate render to persist.
2. **Append-only protection is bypassable via TRUNCATE (confirmed).** `decision_artifacts`, `rule_overrides`, `sla_stage_instances` and `sla_stage_events` all grant TRUNCATE to `anon`/`authenticated`. TRUNCATE ignores row-level security, so the "append-only" guarantee for issued artefacts, overrides and SLA history can be wiped by any signed-in client. `sla_stage_instances` / `sla_stage_events` additionally grant UPDATE and DELETE (currently held back only by the absence of policies).
3. **Security events can be fabricated with an arbitrary actor (confirmed).** An older overload of `public.log_security_event_as_actor(..., _ip_address text, ...)` is EXECUTE-granted to `anon` and `authenticated`, so a client can write security-log rows attributed to any user. The newer overload is correctly restricted to `service_role`.
4. **Already present and structurally sound** (to be behaviourally verified, not rebuilt): `decision_gate_status` / `check_decision_gates` / `enforce_application_decision_gate`, gate enforcement inside `perform-workflow-action`, `DecisionGatesPanel` in `ApproverDecisionView`, `issue_decision_artifact` with versioning + required-field validation, the SLA runtime (`sla_stage_open/pause/resume/complete/mark_breached/mark_escalated`, `resolve_stage_sla`, `rfi_pause_sla`, `sla-escalation-sweep`), `log_rule_override` with justification checks, and the SLA Manager / Security Events consoles.
5. **Unverified so far:** every runtime behaviour (gate denial, pause/resume, breach-once escalation, notification dispatch, artefact immutability across template edits, RLS per persona) and automated regression coverage for these paths.

## Fixes to make

### A. Certificate content (LIC-DEC-002)
- Add a dedicated certificate HTML renderer (shared helper) producing certificate-specific content: entity/applicant name, licence reference, licence/service, regulator, effective date, expiry date where applicable, conditions, signatory — clearly a certificate, not a letter.
- Use it for the certificate preview pane and for `_rendered_html` on certificate issuance; remove the `certUrl ? letterHtml : ''` fallback.
- Pass `_expiry_date` where the licence type defines validity, and keep server-side rejection when required merge fields are absent.

### B. Append-only hardening (LIC-DEC-002, AUD-SEC-001, AUD-OVR-001, ADM-SLA-001)
- Migration: `REVOKE TRUNCATE` (and UPDATE/DELETE where still granted) on `decision_artifacts`, `rule_overrides`, `security_event_logs`, `sla_stage_instances`, `sla_stage_events` from `anon` and `authenticated`.
- Keep existing RLS policies; add explicit deny-write policies where a table lacks them so the intent is readable.

### C. Security-event fabrication (AUD-SEC-001)
- Migration: revoke EXECUTE on the legacy `log_security_event_as_actor(..., text, ...)` overload from `anon`/`authenticated` (restrict to `service_role`), or drop it if unused by any caller — checked before removal.
- Confirm the caller-facing `log_security_event` always derives the actor from `auth.uid()` and never trusts a supplied actor id.

### D. Anything the verification runs expose
Only gaps proven by a failing test get fixed; each fix stays inside the five FRD IDs.

## Verification to run (evidence-producing)

Database/pgTAP suite (new file under `supabase/tests/phase1/`):
- decision gates: ready application approvable; open RFI blocks; unresolved sufficiency blocker blocks; override path requires explicit authorisation + justification and recalculates gates.
- artefacts: v1 issued, source template edited, v1 rendered content unchanged, v2 is a new row; UPDATE/DELETE/TRUNCATE rejected as `authenticated`; missing rationale rejected.
- overrides: valid override persists original + replacement + justification + actor + object; empty and whitespace-only justification rejected server-side; second override appends; unauthorised role rejected.
- security events: redaction of `token`/`authorization`/`password`/`secret`/`api_key`; external user cannot SELECT; internal user without security permission cannot SELECT; authorised admin can.
- SLA: open sets start/due; pause freezes elapsed active time; resume continues; past-due marks breach; escalation fires exactly once; complete sets final state; unauthorised config/state mutation rejected.

Runtime (Playwright against the running app, signed in as an internal approver):
- final-step approval blocked with a non-2xx `DECISION_GATES_UNMET` and gate panel reflecting it; no approval persisted.
- direct edge-function call bypassing the UI still denied.
- letter preview field-by-field check; issuance without rationale fails; certificate preview vs issued certificate content compared byte-wise on the rendered HTML.
- SLA Manager live stages/breaches reflect the scripted pause/resume/breach case.
- notification dispatch rows for SLA warning/breach/escalation and decision issuance, including a forced transport failure recorded as failed (not delivered).

Repository checks: production build, type check, existing vitest suites, lint if configured. New targeted regression tests added; no existing test weakened.

Regression smoke: login, applicant dashboard, draft resume, dynamic form render, document upload, application submission, application queue, workflow action, approval panel, notifications tray, licence register, return submission/review, complaints list, admin hub, route guards.

## Reporting

Final answer will contain the required evidence table with one state per FRD ID (VERIFIED / PARTIALLY VERIFIED / NOT VERIFIED / IMPLEMENTED — EXTERNAL VERIFICATION STILL REQUIRED), exact files changed, migrations/RPCs touched, automated test files with results, manual runtime scenarios with results, any failures shown openly, and anything only external verification can prove — then either `PHASE 1 VERIFIED — READY FOR PHASE 2` or `PHASE 1 NOT YET VERIFIED` with the failing gates listed. Phase 2 will not be started.

## Technical notes

- Certificate rendering helper lives alongside the existing letter rendering in the decision-preview component's module (or a small `src/lib/licensing/` helper) so preview and issuance share one source of truth — this is what makes the content assertion meaningful.
- Grant revocations are a single migration; RLS policies are left intact.
- Escalation-once is asserted via the SLA event ledger rather than by re-running the sweep blindly.
