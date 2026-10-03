# Architecture rules

- AML/CFT policy families are consumed only from the component pinned in `supervisory_assessment_policy_snapshot` (via `supervisory_assessment_pinned_component_internal`), never from "current active" config — so later versions never alter an existing assessment.
- Sector overlay, fact configuration and source binding are enforced in the database commands (`supervisory_assessment_fact_set` / `_fact_override` / snapshot stamp); the browser only displays `supervisory_assessment_configuration_authority` — client checks are not a boundary.
- Configuration immutability is proven with the content fingerprint (`supervisory_policy_component_content_fingerprint`, cfp1, excludes lifecycle metadata) via `supervisory_assessment_policy_basis_integrity`; the legacy status-inclusive `content_hash` values stored in snapshots are historical and are never recalculated — so lifecycle transitions cannot be mistaken for content change.
