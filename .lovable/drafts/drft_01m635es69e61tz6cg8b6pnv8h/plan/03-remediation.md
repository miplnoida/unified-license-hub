## Proposed smallest secure fix (for approval, not applied)

Fix the one shared function, so every caller is corrected at once. No access rule, grant, role or permission changes, and no screen changes.

```sql
CREATE OR REPLACE FUNCTION public.has_portal_capability(
  _user_id uuid, _entity_id uuid, _area portal_area, _capability text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_module text; v_action text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id
     AND NOT public.is_internal_staff_user(auth.uid()) THEN RETURN false; END IF;
  IF public.is_internal_staff_user(_user_id)
     OR public.has_role(_user_id, 'super_admin'::app_role) THEN RETURN true; END IF;

  -- NEW: an institution-scoped question needs a live link to THAT institution.
  IF _entity_id IS NOT NULL AND NOT (
       EXISTS (SELECT 1 FROM public.entity_user_memberships m
               WHERE m.user_id = _user_id AND m.entity_id = _entity_id
                 AND m.status = 'APPROVED' AND m.revoked_at IS NULL
                 AND m.effective_from <= now()
                 AND (m.effective_to IS NULL OR m.effective_to > now()))
    OR EXISTS (SELECT 1 FROM public.ppoc_entity_mappings p
               WHERE p.ppoc_user_id = _user_id AND p.licensee_id = _entity_id
                 AND p.is_active)
  ) THEN RETURN false; END IF;

  v_module := CASE _area WHEN 'licensing' THEN 'licensing'
    WHEN 'returns' THEN 'returns_management'
    WHEN 'complaints' THEN 'complaint_management'
    WHEN 'fp_declarations' THEN 'fit_and_proper' END;
  v_action := CASE _capability
    WHEN 'can_submit' THEN 'submit' WHEN 'can_submit_returns' THEN 'submit'
    WHEN 'can_submit_complaints' THEN 'submit'
    WHEN 'can_submit_fp_declarations' THEN 'submit'
    WHEN 'can_upload_documents' THEN 'upload_documents'
    WHEN 'can_view_status' THEN 'view_status'
    WHEN 'can_respond_rfi' THEN 'respond_rfi' ELSE _capability END;
  RETURN public.sec_has_permission(_user_id, v_module, v_action);
END $$;
```

Everything except the marked block is the current definition, unchanged. Calls with no institution (`_entity_id IS NULL`, the "own application" path) behave exactly as today.

### Impact on legitimate access
- **Applicants:** own applications are unchanged (separate `applicant_id = user` branches).
- **Primary and Secondary users:** keep access to their own institution through approved membership. 28 approved memberships exist.
- **Regulators:** unchanged (internal staff return true first).
- **Decision needed:** 1 of 5 external users linked to an institution only by their profile has **no** approved membership, and there are 0 active PPOC mappings. After the fix that user loses institution-scoped access until a membership is approved through the normal access-request journey. The alternative is to also accept the profile link, which is weaker. You earlier asked not to rely on it.

### Also recommended (separate small items, each needing your approval)
1. `fee_can_view_application_finance` passes `'view'`. With the fix it becomes correctly scoped. No further change needed.
2. Make the `file_uploads` external rule restrictive like `documents`. This is an access-rule change, so it's listed only.
3. Confirm unfiltered bulk updates are rejected by the API layer.

### Regression tests (SQL, TEST fixtures only, inside a rolled-back transaction)
1. A Primary user of institution A cannot pass `has_portal_capability` for institution B, and `fee_can_view_payment` on a B payment returns false.
2. The same user passes for A, and fee and receipt reads on A still work.
3. A revoked or expired member fails. An active PPOC passes.
4. An applicant still reads and updates their own draft (`_entity_id NULL` path).
5. Internal staff are unchanged.
6. `file_uploads` rows for B are not returned to an A user.

Plus re-runs of the existing access, payment and applications Vitest suites.

**Affected files:** one new staged migration only. No app source files change.

**Rollback:** a migration that re-applies the current `has_portal_capability` definition verbatim (already captured). No data changes, so nothing needs restoring.

**Before any change:** these regression tests are written, then run with your separate approval. The migration is staged only after you approve it, and applies only when the draft is accepted. No publishing.
