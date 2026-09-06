# OS-02G1 — Portfolio, Thematic & Systemic Supervisory Intelligence: convergence decision

OS-02G1 is a **read/intelligence layer only**. It creates no business table, no
risk score, no alert, no case, no work queue and no group model. Everything is
derived deterministically from the canonical supervisory spine at query time.

## Primitive inventory and disposition

| Primitive | Disposition | Use in OS-02G1 |
| --- | --- | --- |
| `supervisory_signal`, `supervisory_signal_occurrence` | ACTIVE_CANONICAL | condition identity, recurrence, persistence |
| `supervisory_detector`, `supervisory_detector_run` | ACTIVE_CANONICAL | deterministic theme identity + assessability guard |
| `supervisory_signal_review`, `supervisory_management_assurance_matter` | ACTIVE_CANONICAL | review / disposition / assurance state |
| `supervisory_attention`, `supervisory_reassessment_requirement`, `supervisory_finding`, `supervisory_remediation_action` | ACTIVE_CANONICAL | response and overdue-response facts |
| `entity_risk_state`, supervisory assessments | ACTIVE_CANONICAL (read-only) | displayed as approved rating; never recomputed |
| `licensees`, `supervisory_domain_perimeter`, `supervisory_monitoring_scope_admits`, `regulatory_scope_allows` | ACTIVE_CANONICAL | population and scope enforcement |
| `financial_groups`, `financial_group_members` | ACTIVE_CANONICAL | group aggregation (legal-entity truth unchanged) |
| `peer_ratio_snapshot`, `prudential_min_peers()` | SUPPORTING_READ_MODEL | peer view with minimum-sample guard |
| `prudential_ewi_rules`, prudential EWI alert objects | LEGACY_NOT_AUTHORITY | not consumed; OS-02E detectors are the detection authority |
| any per-domain bespoke portfolio dashboard aggregation | DUPLICATIVE_DEPRECATION_CANDIDATE | superseded by `supervisory_portfolio_*`; no destructive cleanup performed |

## Objects added (all non-persistent)

Views: `supervisory_portfolio_condition`, `supervisory_portfolio_entity`
(both `security_invoker=true`).

Functions (all `STABLE`, `SECURITY INVOKER`, no anon EXECUTE):
`supervisory_portfolio_intelligence_overview`, `_theme_register`,
`_theme_detail`, `_change_lens`, `_group_intelligence`, `_cross_domain`,
`_peer_view`, `_detector_assessable`.

## Rules enforced

- Theme identity = governed detector code / detector name / source kind. No
  free-text or model-generated themes.
- Components only: no composite or systemic score is published.
- Entity, condition, occurrence and response counts are distinct and labelled.
- A detector without a COMPLETED run in the window is `NOT_ASSESSABLE`, never
  "improving".
- Peer results below the approved minimum sample return `INSUFFICIENT_PEER_DATA`.
- Group aggregates report visible vs canonical membership and always drill back
  to legal entities.
- Every aggregate carries provenance and drill-down to canonical record ids.

Certification: `scripts/verify-os02g1-portfolio-thematic-intelligence.sql`
(PT-01 … PT-32, all fixtures rolled back).
