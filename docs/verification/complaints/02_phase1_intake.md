# Phase 1 — Canonical complaint intake (evidence)

Migration: `20260717…_phase1_canonical_intake.sql` (see `supabase/migrations/`).

## What changed

1. **New table** `public.complaint_intake_rules`
   - Columns: `regulator_id`, `variant` (`public|licensee|internal|staff`), `required_fields text[]`, `allow_anonymous`, `max_attachments`, `notes`, timestamps.
   - RLS enabled, read granted to `authenticated` and `anon`, write restricted to `admin` / `super_admin`.
   - Seeded a default row for each variant (regulator_id NULL) so the RPC always has a fallback.

2. **RPC rewrite** `public.create_complaint(_variant text, _payload jsonb)` — SECURITY DEFINER, `search_path = public, pg_temp`, `PUBLIC` revoked, executable by `authenticated` + `anon`.
   Behaviour:
   - Rejects unknown variants.
   - Loads the regulator-scoped rule row and falls back to the default row.
   - Strips `severity`/`priority` for `public` and `licensee` variants (external callers cannot escalate themselves).
   - Enforces required fields dynamically from the rules table.
   - Emits **structured** validation errors in `PG DETAIL` as a JSON array of `{code, field, message}`.
   - Enforces vulnerability consistency (nulls category/notes when indicator is false).
   - Requires email for non-anonymous public submissions; blocks anonymous when the rule disallows it.
   - Inserts the row, best-effort creates a `workflow_instances` row against the published version of the Complaint Management Workflow, writes an `audit_logs` entry, and enqueues a `complaint.created` notification into `notification_outbox`.
   - Returns `{ id, complaint_number, workflow_instance_id, complaint }`.

3. **Backwards-compatible wrapper** `create_complaint(jsonb)` — kept as a SQL wrapper that defaults variant to `internal` so legacy callers keep compiling; new code must use the two-arg signature.

4. **Frontend hook** `src/hooks/useCreateComplaint.ts`
   - Exposes `createComplaint({ variant, payload })` and `useCreateComplaint()`.
   - Parses PG `DETAIL` into `ComplaintValidationError` with a `fieldErrors[]` array so forms can render per-field messages.
   - `NewInternalComplaint.tsx` retains its existing field-level errors, duplicate-submit guard and unsaved-changes Cancel flow — those were delivered in the previous slice.

## Evidence

```
$ psql -c "\df create_complaint"
create_complaint(_payload jsonb)                       -> jsonb   (legacy wrapper)
create_complaint(_variant text, _payload jsonb)        -> jsonb   (canonical)

$ psql -c "SELECT variant, required_fields, allow_anonymous FROM complaint_intake_rules WHERE regulator_id IS NULL ORDER BY variant"
 internal | {subject,description,intake_source}                   | f
 licensee | {subject,description,licensee_id,email}               | f
 public   | {subject,description}                                 | t
 staff    | {subject,description,intake_source,complaint_type_id} | f
```

## Not yet done for Phase 1 (declared honestly)

- **SQL integration test file** `supabase/tests/complaints/01_create.sql` — the harness itself is not in the repo yet; will land as part of Phase 8 when the disposable test-DB workflow is added.
- **Refactor of the public submission Edge Function and the licensee submit page** to call the new two-arg RPC — currently only `NewInternalComplaint` uses the canonical path. Existing legacy callers still work via the wrapper, so no regression, but the migration is incomplete until they switch.
- **`useCreateComplaint` frontend Vitest** — the current schema-level tests (`complaintSchemas.test.ts`) exercise the client validation but not the RPC boundary.

Status of the 16-item audit list touched by Phase 1:

| # | Item                                     | Status         |
|---|------------------------------------------|----------------|
| 1 | Canonical create path                    | Partially Fixed |
| 2 | External severity/priority stripped      | Fixed          |
| 3 | Shared Zod validation (internal intake)  | Fixed (prev slice) |
| 4 | Configurable required fields             | Fixed          |
| 5 | Structured validation errors             | Fixed          |
| 6 | Workflow instance created on submit      | Partially Fixed (best-effort; skipped when no published version) |
| 7 | Audit + notification enqueue             | Fixed          |

All other items remain scoped for later phases per the approved plan.
