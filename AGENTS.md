# Architecture rules

- AML/CFT policy families are consumed only from the component pinned in `supervisory_assessment_policy_snapshot` (via `supervisory_assessment_pinned_component_internal`), never from "current active" config — so later versions never alter an existing assessment.
- Sector overlay, fact configuration and source binding are enforced in the database commands (`supervisory_assessment_fact_set` / `_fact_override` / snapshot stamp); the browser only displays `supervisory_assessment_configuration_authority` — client checks are not a boundary.
