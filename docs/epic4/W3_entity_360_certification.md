# Epic 4 — W3: Enterprise Entity 360 Certification

Scope: one canonical cross-domain Entity 360 supervisory view; legacy AML-only
`entity360_section` block retired.

## Delivered
- `public.entity_supervisory_360(uuid)` — caller-privilege (SECURITY INVOKER) read model:
  entity identity, per-domain risk state, open findings, remediation, enforcement,
  AML posture, examinations, and derived "next supervisory action" from
  `public.supervisory_work_item`.
- `src/hooks/useEntitySupervisory360.ts`, `src/components/entity-detail/EntitySupervisory360Panel.tsx`
  wired into `src/pages/entities/Entity360Detail.tsx`.
- Legacy AML `entity360_section` block retired by migration; AML posture now surfaces
  only through the canonical panel.

## Verification — `scripts/verify-epic-4-w3-entity-360.sql` (18/18 PASS)
W3-01..07 identity/domain/risk-state composition; W3-08 linked enforcement shown in its
supervisory domain; W3-09..15 findings, remediation, AML, examination and derived next
action; W3-16 legacy AML block retired; W3-17 external persona denied
("supervisory read models are internal only"); W3-18 read model executes under caller
privileges (no SECURITY DEFINER escalation).

Fixtures use governed writer context (`app.supervisory_risk_state_writer =
'assessment_transition'`) and real permission grants (`prudential_supervisor`,
`market_conduct_supervisor`) rather than bypassing RLS.

## Performance (authenticated persona, RLS on)
- `entity_supervisory_360`: ~11 ms
- `supervisory_timeline` (100 rows, pre-existing W2 model): ~184 ms — recorded, no regression

## Regression sweep (all exit 0)
`verify-epic-2-supervisory-spine`, `verify-epic-3-aml-closed-loop`,
`verify-dms-phase4-closure`, `verify-f0c-certification` (34 TESTED_PASS / 0 FAIL).
Build: OK.

## Verdict
EPIC 4 — W3 ENTITY 360: CERTIFIED.
