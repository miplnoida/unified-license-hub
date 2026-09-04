---
name: Real Working System Rule
description: Mandatory engineering rule — no mock data/actions; every screen and button must have a real backend path with authorization, persistence and audit, plus the required acceptance reporting format
type: preference
---

This is an operational enterprise system, not a UI prototype.

## 1. No mock functionality
Never introduce hardcoded business data, fake counts/statuses, mock arrays as production data, simulated success responses, placeholder handlers, local-state-only persistence, TODO workflows, or client-generated business outcomes. Demo/test fixtures are allowed only inside explicitly identified demo/test scripts.

## 2. Real data only
Every screen reads from canonical tables, governed read models, or real backend RPC/API operations. Never duplicate business truth in the browser.

## 3. Real actions only
Every actionable control must perform a real persisted operation with this full chain:
UI → hook/service → governed RPC/API → permission + scope validation → business validation → canonical DB mutation → audit/event history → refreshed UI state.
If a required backend operation does not exist, implement the backend in the same wave. Never ship a non-functional control.

## 4. Server is authoritative
Enforce server-side: RBAC, entity scope, maker/checker, lifecycle/status transitions, required rationale, evidence requirements, provenance, effective dating, audit trail. Client checks are UX only.

## 5. Identifiers
Use real canonical references and database identifiers. Never manufacture fake UI identifiers.

## 6. Acceptance reporting (per feature)
Report: Data source; Read path (screen → hook → backend); Action path (button → hook → governed operation → tables/events); Persistence; Authorization (permission/scope enforced); Audit (event/audit record created).
A visible feature with no real backend path = verdict FAIL.

## 7. Testing proportionality
- UI-only presentation change: typecheck + build + targeted UI check.
- Functional workflow: backend verifier + functional test + typecheck + build.
- Security/lifecycle/canonical-model change: add relevant regression/security gates.
Do not run unrelated large suites on every small wave.

## 8. Definition of complete
Visual presence is not completion. Complete = real data + real action + real persistence + real authorization + real audit + success/failure handling.
