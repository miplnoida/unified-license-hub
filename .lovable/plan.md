## Problem

Internal complaint intake (`useCreateInternalComplaint` → `/complaints/new-internal`) fails RLS with `new row violates row-level security policy for table "complaints"`.

**Root cause:** The only PERMISSIVE INSERT policy on `public.complaints` is `"Insert complaints"` with `WITH CHECK (auth.uid() = complainant_id)`. Internal staff record complaints on behalf of others (or anonymously) and never set `complainant_id`, so the check fails. The restrictive external-gate policy already allows internal staff (non-external roles) through — but with no permissive policy passing, the insert is rejected.

## Fix

Add a permissive INSERT policy that lets internal roles (`super_admin`, `admin`, `supervisor`) insert complaints regardless of `complainant_id`. Keep the existing self-insert policy for regular authenticated users, and keep the restrictive external-gate policy unchanged.

### Migration

```sql
CREATE POLICY "Staff can insert internal complaints"
  ON public.complaints
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );
```

No frontend or hook changes required. External-user gating remains enforced by the existing RESTRICTIVE policy.

## Verification

1. Sign in as an admin/supervisor, submit `/complaints/new-internal` — record saves and redirects to the detail page.
2. Sign in as a regular authenticated user — self-submission via existing flow still works (uses original `"Insert complaints"` policy).
3. Sign in as an external portal user without `can_submit_complaints` — insert still blocked by the restrictive gate.