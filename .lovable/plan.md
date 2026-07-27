## What's wrong

The complaints backend gate is checking permission actions that do not exist in the permission catalogue, so almost every internal user is treated as "not internal" no matter what you grant them in Role Management.

Verified against the live database:

- `has_complaint_perm(user, action)` allows a user only if they hold the static role `admin`/`super_admin`, or hold a dynamic permission `complaint_management.<action>`.
- Every complaints read path calls it with `'view_all'` or `'triage'`:
  `list_complaints`, `get_complaint`, `complaints_dashboard_counts`, `complaints_analytics`, `duplicate_hub_stats`, `escalation_hub_stats`, `list_duplicate_clusters`, `pending_duplicate_count`, `pending_escalation_count`, `detect_complaint_duplicates`, plus action RPCs (`assign_complaint`, `classify_complaint`, `transition_complaint_status`, `update_complaint_severity`, `retry_complaint_triage`, `link_complaint_licensee`, `decide_duplicate_pair`, `simulate_escalation_rule`, `run_complaint_escalation_sweep`).
- The catalogue for `complaint_management` contains: `view, view_status, create, edit, submit, upload_documents, assign, close, escalate, investigate, resolve, analytics, retry_triage`. There is **no `view_all` and no `triage`**.

Result: a Legal/Compliance Reviewer, Analyst, Market Conduct Supervisor, etc. with `complaint_management.view` granted passes the route guard and sidebar (frontend is correct), then `list_complaints` falls back to `complainant_id = auth.uid()` (empty list) and `complaints_dashboard_counts` raises `Not permitted`. Only `super_admin`/static `admin` work today.

Two secondary issues found while verifying:
- Several roles that hold `complaint_management.view` have no `scope_config` entry for that module (Legal/Compliance Reviewer, Approver/Decision-Maker, Prudential Supervisor, System Administrator, Legacy Admin). Table RLS uses `has_scoped_permission(...)`, which denies when the scope kind is missing/unknown — so even after the RPC gate is fixed, direct table reads would still return nothing for those roles.
- `has_complaint_perm` grants blanket access from the static `admin` role, bypassing the dynamic catalogue — inconsistent with the rest of the RBAC hardening.

## Fix

**1. Migration — canonicalise the action keys (single change, no RPC rewrites)**

Redefine `public.has_complaint_perm(_user_id, _action)` to resolve aliases to real catalogue actions before checking:

```text
view_all  -> view
triage    -> assign   (also satisfied by edit / investigate)
```

and otherwise check the action as-is. Keep `super_admin` bypass; keep static `admin` for now only if it maps to the Legacy Admin dynamic role (it does), otherwise drop it in the same migration for consistency.

This restores every complaints read/action path at once, without touching the 20+ RPC bodies or the frontend.

**2. Migration — backfill missing scope config**

For every active role holding `complaint_management.view` with no `complaint_management` key in `roles.scope_config`, set `{"scope": "all"}` (mirrors what Market Conduct Supervisor / Analyst / Executive Supervisor already have). This makes the table-level RLS policies (`Read complaints`, `Update complaints`) resolve for those roles.

**3. Verification (after migration)**

- Query the gate directly for one user per affected role: `select has_complaint_perm(<uid>,'view_all')` → true.
- Run `list_complaints` and `complaints_dashboard_counts` impersonating a non-admin internal role and confirm rows return instead of `Not permitted`.
- Confirm an external/applicant user still only sees their own complaints, and a role **without** `complaint_management.view` still gets zero rows / denied.
- Sign in the preview as a Legal/Compliance Reviewer style account and open `/complaints`, `/complaints/duplicates`, `/complaints/escalations`.

## Out of scope

No frontend/route/sidebar changes — those were checked and already gate correctly on `complaint_management.view`.
