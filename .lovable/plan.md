## Fix: RLS blocking complainant from filing complaints

### Problem
External users (applicant / pre_licensee / licensee_primary / licensee_secondary) filing a complaint via `ComplaintsList.tsx` hit:

> new row violates row-level security policy `external_complaints_select_capability_gate` for table `complaints`

The insert itself is legal — the INSERT restrictive gate (`external_complaints_insert_capability_gate`) accepts the row — but the client sends `.select().single()` (PostgREST `Prefer: return=representation`), so Postgres also evaluates the restrictive **SELECT** gate on the returned row. When that gate evaluates to false, the whole statement is rolled back and Postgres reports the SELECT policy name. That's exactly what we see: no row lands in `complaints`, but the error names the select gate.

The current SELECT gate only lets external users see a complaint via `has_portal_capability(..., 'can_view_status')` or `can_submit_complaints`. The row-owner branch (`complainant_id = auth.uid()`) is only inside `external_can_access_complaint_values`, which additionally requires a portal-capability match. Any external user whose dynamic role is missing one of those two complaint-management actions — or where the capability lookup misbehaves inside the `RETURNING` snapshot — gets blocked on their own row.

### Fix (single migration, RLS only — no app code changes)

Rewrite the restrictive SELECT policy on `public.complaints` so it always lets:

1. Non-external users through (unchanged short-circuit `NOT has_external_role(auth.uid())`).
2. **The complainant view their own complaint** — plain `complainant_id = auth.uid()` branch, independent of `has_portal_capability`. This is the missing branch that causes the regression: someone who just successfully passed the INSERT gate must, by definition, be allowed to see the row they just created.
3. Existing capability-based access for related external users (e.g. a licensee-primary viewing complaints against their entity) via the current `external_can_access_complaint(..., 'can_view_status' | 'can_submit_complaints')` checks.

SQL sketch:

```sql
DROP POLICY "external_complaints_select_capability_gate" ON public.complaints;

CREATE POLICY "external_complaints_select_capability_gate"
  ON public.complaints
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.has_external_role(auth.uid())
    OR complainant_id = auth.uid()
    OR public.external_can_access_complaint(auth.uid(), id, 'can_view_status')
    OR public.external_can_access_complaint(auth.uid(), id, 'can_submit_complaints')
  );
```

No changes to INSERT/UPDATE gates, no changes to `ComplaintsList.tsx`, no changes to the helper functions.

### Why this is safe
- The new OR branch only widens SELECT for rows where `complainant_id = auth.uid()` — i.e. the complaint the user themselves filed. Users could never see complaints belonging to *other* complainants through this branch.
- The permissive `Read complaints` policy already allows `auth.uid() = complainant_id`; the restrictive gate was inadvertently narrower than the permissive policy for external users, which is the bug.
- Internal staff and non-external users are unaffected (short-circuit branch unchanged).

### Verification
1. Log in as the reporting user (applicant/pre_licensee).
2. File a complaint from the licensee portal — expect success toast and the acknowledgement dialog.
3. Confirm the new row appears in the complaints list for that user only.
4. Log in as a different external user with no relationship to that complaint — confirm they still cannot see it.
