# RBAC Backend — Policy Change Log

Chronological record of every policy, helper, and grant introduced or
replaced by the backend RBAC hardening effort. Each entry links the
migration that shipped the change and the pgTAP suite that guards it.

## Phase 1 — Canonical helpers (shipped)

Migration: `supabase/migrations/20260721060418_*.sql`

Added:

- `public.is_super_admin(uuid)` — `SECURITY DEFINER`, `STABLE`, `search_path = public`; executable by `authenticated`, `service_role`.
- `public.has_any_permission(uuid, text[])` — accepts `{"module.action", ...}`, short-circuits on `super_admin`.
- `public.user_has_entity_assignment(uuid, uuid)` — reads `licensees.lead_regulator_id / regulator_officer_id / alternate_regulator_id`.
- `public.is_assignment_only_regulator(uuid)` — mapped on ≥1 licensee **and** zero dynamic-role permissions; super admins excluded.

Replaced (behaviour preserved):

- `public.has_permission(uuid, text, text)` — re-declared to route the super-admin bypass through `is_super_admin` and to lock `search_path = public`. `EXECUTE` revoked from `PUBLIC`.
- `public.can_view_entity_returns(uuid, uuid)` and `(uuid, uuid, text, text)` — refactored to compose the new helpers. Semantics unchanged: `is_super_admin OR has_permission('returns_management','view_all_entities') OR user_has_entity_assignment`.

pgTAP: `supabase/tests/rbac/00_helpers.sql` (24 assertions across four synthetic personas).

No table policies, table grants, or data were touched in this phase.

## Pending phases

| Phase | Scope | Status |
| --- | --- | --- |
| 2 | RLS on `returns_filed` + all `return_*` child tables using the canonical pattern; assignment branch gated by submitted-lifecycle. | Not started |
| 3 | Storage policies on `return-attachments`; object-scoped assignment/status gate. | Not started |
| 4 | Admin/configuration lockdown across `return_configs / return_types / return_templates / late_fee_* / sla_* / business_calendar_* / notification config / permission catalog / master_data_* / regulators / sectors`. | Not started |
| 5 | Reports & exports (`report_*`, `audit_export_jobs`), AI (`application_ai_assessments`), consolidated (`return_consolidated_analysis`). | Not started |
| 6 | Guards at the top of every mutating RPC; edge functions verify JWT + `has_permission` before service-role writes. | Not started |
| 7 | Remaining modules: applications, registrations, licenses, complaints, compliance, prudential, conduct, enforcement, inspections, correspondence, fit & proper, fees, payments, refunds, audit_logs. | Not started |
| 8 | Views & MVs recreated with `security_invoker = on`; dashboard MVs wrapped by permission-checked RPCs. | Not started |
| 9 | Remove superseded permissive policies; clear `supabase--linter` findings; regenerate `docs/rbac/policy-inventory.md`. | Not started |

Each pending phase must land in its own migration with its own pgTAP
suite green before the next phase begins.
