---
name: Licensing decision gates & issued artefacts
description: Server-enforced decision gates for final approval and immutable decision letter/certificate versions
type: feature
---
- `public.decision_gate_status(application_id)` computes decision readiness: blocking gates are unresolved sufficiency blockers (not overridden) and open RFIs; payment is advisory.
- `perform-workflow-action` refuses `approve` on the final workflow step when a blocking gate is unmet (422 `DECISION_GATES_UNMET`), writing a security event + compliance audit denial.
- `DecisionGatesPanel` renders the same computation at the top of the Consolidated Decision View.
- Issued documents are recorded via `issue_decision_artifact` into `decision_artifacts`: versioned per (application, artifact_type), required merge fields validated server-side (application_number, applicant_name, license_type, rationale for letters, effective_date for certificates, rendered document), and rows are append-only (no update/delete).
- `security_event_logs` and `rule_overrides` are append-only; security events carry severity/module/action/object/correlation_id and credential-like keys are redacted by `redact_sensitive_jsonb`.
