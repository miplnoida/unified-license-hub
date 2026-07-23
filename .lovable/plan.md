## Root cause (verified)

The Building Society pre-license template `d75f6f3b…` exists with `status='published'`, `form_type='pre_license'`, `category_id=82d0473b…` (matches the selected category), and `regulator_id=8dd8ac87…`. The client filter in `NewApplication.tsx` (`matchedTemplates` memo) would match it correctly.

The template is invisible to the applicant because of RLS on `public.form_templates`. The current SELECT policy is:

```
Read form templates:
  is_super_admin(uid)
  OR has_scoped_permission(uid, 'form_management', 'view', NULL, sector_id, created_by)
```

Applicants (and pre-license users) don't have `form_management.view`, so `useFormTemplates` returns an empty array and the UI falls into the "No published forms found for this category" branch. This policy was tightened during the recent RBAC hardening pass, which is why it "was working fine" before.

Note: `matchedTemplates` reads `form_templates` directly — it doesn't consult `form_versions` — so this is purely an RLS visibility issue, not a versioning issue.

## Fix

Add a second permissive SELECT policy on `form_templates` that lets any authenticated user read only rows that are safe to expose to applicants (nothing sensitive lives in the template row itself — schema is fetched separately from the published version):

```sql
CREATE POLICY "Applicants can read published application templates"
ON public.form_templates
FOR SELECT
TO authenticated
USING (
  status = 'published'
  AND form_type IN ('pre_license', 'application', 'post_license', 'registration')
);
```

Scoped to `status='published'` and applicant-facing `form_type`s only, so:
- Draft/archived templates stay hidden from applicants.
- Internal-only templates (`internal`, `internal_license_action`, `returns`, etc.) stay restricted to `form_management.view` holders.
- The existing scoped policy for admins/regulators is untouched.

## Verification

1. Re-run the New Application flow as the applicant → Sector = Banking, Sub-Sector/Category = Building Society → confirm "1 mandatory form(s) to complete" appears and Proceed enables.
2. Confirm draft returns templates (`P&L`, `Balance Sheet`) don't leak into applicant queries.
3. Confirm admin form list (`/admin/forms`) still shows all templates unchanged.

## Files touched

- New migration under `supabase/migrations/` that creates the extra SELECT policy.
- No frontend or hook changes.
