---
name: Canonical regulatory role catalogue
description: 48 database-governed role templates (43 internal + 5 external personas) in sec_role_templates, materialised into sec_roles; break-glass only for super_admin
type: feature
---

- `sec_role_templates` is the catalogue of record for personas; live roles in `sec_roles` are
  materialised from a template plus its `sec_role_template_permissions`. Never hardcode a persona
  in the frontend and never grant permissions ad hoc on a live role that has a template.
- Reconciliation rule: a role with **zero active assignments** is reset to exactly its template's
  permissions; a role with active assignments is only ever widened, never silently narrowed.
- Persona families:
  - Platform admin: System / Security / Regulatory Data / Integration Administrator,
    Workflow Administrator, Rule Engine Administrator, Notification Administrator.
  - Registration & licensing: Registration Officer, Entity Resolution Officer/Supervisor,
    Entity Structure Officer/Supervisor, Licensing Officer/Supervisor, Appeals Panel Member, Legal Counsel.
  - Supervision: Prudential Analyst/Supervisor, Payment Systems Supervisor, Conduct Analyst/Supervisor,
    Complaints Officer/Supervisor, AML/CFT Officer/Supervisor, Operational Resilience Officer,
    Inspector, Inspection Supervisor, Fit & Proper Officer/Supervisor, Returns Officer/Supervisor,
    Enforcement Officer/Supervisor, Coordination Officer/Supervisor.
  - Oversight: Auditor, Executive Management, Read Only, Regulatory Analyst.
  - External: Licensee Primary User, Licensee Secondary User, Entity PPOC, Applicant, Pre-Licensee —
    all scoped to `own` records on returns, applications, compliance, licences, complaints and F&P.
    Secondary users prepare but never submit.
- `is_break_glass` is reserved for the single `super_admin` role. No other role may carry it.
- Maker-checker invariant: officer personas hold recommend/edit actions; the matching supervisor
  persona holds the `approve`/`decide` action for the same module.
