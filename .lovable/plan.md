# Fix: "permission denied for table approval_action_notifications"

## Verified root cause

It is **not** a broken RLS policy and **not** a role-resolution failure. It is a **missing table privilege** caused by an earlier deliberate hardening migration.

Confirmed against the live database:

- RLS is enabled with exactly two correct policies: `SELECT` gated on `can_read_approval_config(auth.uid())` and `ALL` gated on `can_mutate_approval_config(auth.uid())`. Both helpers begin with `is_super_admin(...)`, so a Super Admin passes them.
- The table ACL for the `authenticated` role is `rDxtm` — read only. `INSERT`, `UPDATE`, `DELETE` are absent.
- Migration `20260820164310_...` (governed-operations hardening) ran `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated` over a list of tables: `approval_step_actions`, `approval_step_entry_notifications`, `approval_action_notifications`, plus payments/RFI tables.
- For `approval_step_actions` that revocation was paired with governed RPCs (`approval_step_action_save`, `approval_step_action_delete`) and the UI was migrated to them. **The two notification tables never got their RPCs**, and `useActionNotifications` / `useStepEntryNotifications` still perform direct table DML — hence a grant-level "permission denied for table", which fires before any policy is evaluated and is therefore identical for Super Admin and everyone else.

Secondary (real, but not the cause of this error): `is_super_admin` → `has_role` reads **only** the legacy `user_roles` table. A Super Admin held purely through `user_dynamic_roles → roles.system_role = 'super_admin'` (1 such assignment exists today) would be invisible to every RLS policy in the system. This is the "frontend true / database false" hazard called out in the request and is worth the small shared correction.

## What will be built

### 1. Governed write RPCs (mirrors the existing approval_step_actions pattern)

New `SECURITY DEFINER` functions in `public`, `search_path = public`, `EXECUTE` granted to `authenticated` and `service_role` only:

- `approval_action_notification_save(...)` — upsert one recipient binding (step, action_type, event_key, recipient_type, recipient_config, template_id, is_enabled).
- `approval_action_notification_delete(_id uuid)`
- `approval_step_entry_notification_save(...)` / `approval_step_entry_notification_delete(_id uuid)`

Each function's **first statement** re-derives `auth.uid()` itself (never trusting a passed-in user id) and raises `not_authorized` (`SQLSTATE 42501`) unless `public.can_mutate_approval_config(auth.uid())` is true. Table DML happens only after that gate. No new grants are added to the tables themselves, so the hardening posture is preserved exactly.

This keeps the permission matrix intact by construction: Super Admin and any role holding `workflow_management.manage_config` can write; Analyst, Licensing Officer, Applicant and unrelated custom roles are refused with `42501`, not a silent no-op. Reads continue through the existing `SELECT` policy, so View mode and Edit mode read the same persisted rows.

### 2. Shared Super Admin recognition fix (smallest safe correction)

Redefine `public.is_super_admin(_user_id)` to be true when **either**:

- the legacy `user_roles` row exists (unchanged compatibility), **or**
- an active `user_dynamic_roles` row maps to a `roles` record whose `system_role = 'super_admin'`.

Matching is on the `system_role` enum/id mapping only — never on role display names. `has_role`, `has_permission` and every workflow-step authorization function stay untouched, so the strict step-authorization fix is not disturbed.

### 3. Frontend rewiring (no UI/behaviour change)

- `src/hooks/useActionNotifications.ts` — replace `.from(TABLE).upsert/insert/update/delete` with `supabase.rpc(...)`. Existing payload builders (`buildActionNotificationPayload`, `normalizeRecipientConfig`) and validation stay as-is and feed the RPC arguments.
- `src/hooks/useStepEntryNotifications.ts` — same treatment.
- `src/lib/workflowTemplateSnapshot.ts` — the clone path inserts into both notification tables; route those inserts through the same RPCs so template cloning does not regress.
- Reads (`ActionNotificationsEditor`, `StepEntryNotificationsEditor`, `WorkflowActionPreviewDialog`, snapshot loader) remain direct `SELECT` — already permitted.

### 4. Verification (before anything is called fixed)

Database level, per persona, using the real dynamic-role Super Admin as well as a legacy one:

- Impersonated `SELECT/INSERT/UPDATE/DELETE` round trip on `approval_action_notifications` via the RPCs: Super Admin allowed; Analyst, Licensing Officer, Applicant and an unrelated internal role each rejected with `42501`.
- pgTAP additions under `supabase/tests/rbac/` covering the four RPCs and the extended `is_super_admin`.

Runtime, end to end in the preview as the signed-in Super Admin:

- Registration Approval Workflow → Edit → Step → Action → Notifications: add Applicant recipient, add Next Step Approver recipient, pick a template, save, close, reopen Edit — configuration reloads identically; update a recipient, delete a recipient, save again. No permission error at any point.
- Configure Step 1 → Approve → Applicant, then perform a real Step 1 approval and read the dispatch log to confirm the applicant is the resolved recipient and the approver did not receive the applicant notification.

Regression sweep: existing workflow step authorization tests, `workflowRuntimeNotificationDispatch.test.ts`, and the approval-workflow RLS suite must stay green; no role records or existing workflow rows will be edited to work around the policy.

## Report to be delivered

Root cause stated plainly as: **missing `INSERT/UPDATE/DELETE` grant on `authenticated` from the governed-operations revocation, with no compensating RPC for the notification tables** — plus the latent dynamic-role blind spot in `is_super_admin`, fixed alongside.
