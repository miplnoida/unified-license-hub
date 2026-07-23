---
name: External-user RLS invariant
description: Every public-portal table must keep an ownership-based external branch alongside any internal has_permission branch
type: constraint
---
When adding or refactoring RLS on a public-schema table used by any external portal (applicant, pre-licensee, licensee primary/secondary, complainant), the USING / WITH CHECK expression MUST retain an ownership path in parallel with any internal permission gate. Shape:

  is_super_admin(uid)
  OR has_permission / has_scoped_permission(...)         -- internal
  OR <ownership predicate>                                -- external

Ownership predicates already available in the DB (do not invent new ones without checking):
- can_read_application(uid, application_id) / can_mutate_application(uid, application_id)
- can_read_return_filed(uid, return_id) / can_mutate_return_filed(uid, return_id)
- can_read_compliance_return(uid, id) / can_mutate_compliance_return(uid, id)
- user_has_entity_assignment(uid, licensee_id)
- ppoc_mapped_licensee_ids(uid)
- external_can_access_document_ref(uid, entity_type, entity_id, capability)
- external_can_access_complaint(uid, complaint_id, capability)
- has_external_role(uid), is_internal_staff(uid)
- Direct column ownership: user_id = auth.uid(), uploaded_by = auth.uid(), complainant_id = auth.uid(), applicant_id = auth.uid(), submitted_by = auth.uid()

**Why:** During the 2026-07 RBAC hardening, `form_templates` RLS was rewritten to require `has_permission(form_management, view)`, which silently broke applicant "New Application" (empty matchedTemplates → "No published forms found for this category"). The migration on 2026-07-23 restored applicant read of `status='published'` templates for form_type in (pre_license, application, post_license, registration).

**How to apply:** Before merging any RLS change on a table listed in mem://security/external-user-rls-invariant.md, run `SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid = 'public.<table>'::regclass;` and confirm at least one policy per command (r/a/w) still contains an external-ownership predicate. Do NOT rely on frontend gating alone — RLS is the enforcement point.

Frontend counterpart: `PortalRoute` in src/components/auth/PortalRoute.tsx + INTERNAL_ROLES in src/types/platform.ts already route external users through ownership rather than internal module permissions. Keep that mapping intact; new portal-facing routes must use PortalRoute, not PermissionRoute.
