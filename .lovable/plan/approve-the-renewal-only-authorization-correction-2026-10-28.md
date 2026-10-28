# Approve the renewal-only authorization correction

## Current result
Both missing supervision menu links are fixed and verified in an authorized browser. Independent upload verification and recovery are implemented and tested, but a real OTP/upload journey still needs mailbox access and approval to send a test OTP. Atomic scan enqueue/retry handling is implemented and tested; scanner provider commissioning and automatic scheduling remain blocked. No documents have been released or historical records changed.

## Approval scope: renewal authorization only
Change only the existing non-staff eligibility check inside `public.create_application_draft(text,jsonb,uuid)`. The full proposed replacement is saved in `docs/renewal-authorization-proposed.sql`, not applied. All surrounding SQL remains byte-identical to the inspected hosted definition.

### Exact replacement SQL
Replace the existing line:
```sql
IF NOT public.can_act_on_specific_license(v_license_id, v_license_holder, NULL, NULL, NULL) THEN
```
with:
```sql
IF NOT public.can_act_on_specific_license(v_license_id, v_license_holder, NULL, NULL, NULL)
   AND NOT COALESCE((
     v_data->>'is_renewal' = 'true'
     AND v_data->>'renewal_of_license_id' = v_license_id::text
     AND public.post_license_service_applicability(v_service_id::uuid, v_license_id) = 'OK'
     AND EXISTS (SELECT 1 FROM public.services s WHERE s.id = v_service_id::uuid AND s.name = 'Renew')
     AND EXISTS (
       SELECT 1 FROM public.licensees e
       WHERE e.id = v_license_holder AND e.merged_into_entity_id IS NULL
         AND (e.applicant_id = v_uid
              OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.licensee_id = e.id)
              OR EXISTS (SELECT 1 FROM public.entity_user_memberships m WHERE m.user_id = v_uid AND m.entity_id = e.id AND m.status = 'APPROVED')
              OR public.can_current_user_access_licensee(e.id, v_ctx.sector_id))
     )
     AND EXISTS (
       SELECT 1 FROM public.licenses l WHERE l.id = v_license_id
         AND lower(trim(l.status)) IN ('active','approved','issued','valid','in_good_standing','expired')
         AND l.valid_until IS NOT NULL
         AND CURRENT_DATE > l.valid_until::date + public.license_grace_days(l.sector_id,l.sub_sector_id,l.category_id)
     )
   ), false) THEN
```

## Security impact
- Existing normal post-licence authorization is unchanged.
- Adds a renewal-only exception for an existing approved member, linked primary user, original applicant or existing sector-scoped access holder of the resolved entity.
- Exception requires a real active/effective, taxonomy-compatible service named `Renew`, a matching renewal licence reference, and an allowed licence status past its configured grace deadline.
- Suspended, revoked, cancelled, inactive, unknown and undated licences remain excluded from this exception.
- Missing/null flags fail closed; flags alone cannot authorize a request.
- No new table grants, roles or RLS changes; no widening of `can_act_on_specific_license` or new-activity entitlement.
- Existing duplicate-request locking, form selection, payment and workflow approval remain unchanged.

## Verification after approval
Add rolled-back positive/negative tests for past-grace owner/member renewal, cross-entity denial, non-renewal denial, prohibited statuses and null flags. Verify through an authorized licensee browser session; do not declare completion from staff bypass or mocked browser state.

## Other blockers, not part of this approval
Scanner endpoint/credentials and verified worker scheduling; applicant mailbox access and authorization for a harmless OTP/upload test. No publication, AML certification or infrastructure changes.