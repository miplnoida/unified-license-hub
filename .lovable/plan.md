## Backfill Registration Status to "approved" for Active Licensees

Several registrations remain in `pending_review`/`pending_verification` even though the entity was later approved and a licensee row exists. This blocks sign-in because the login gate checks `registrations.status`. The "approved" status flow was added after these accounts were created.

### Scope

- **Update** `registrations.status = 'approved'` for every registration whose user owns an `active` licensee.
- Resolution path: `licensees(status='active') → licenses → applications.applicant_id → registrations.user_id`.
- Only `status` is touched. Names, emails, sectors, timestamps, and all other fields stay as-is.

### Out of scope

- No changes to `licensees`, `licenses`, `applications`, `profiles`, or auth users.
- No changes to login logic or approval workflow code.
- Future approvals continue through the normal flow.

### Technical

```sql
UPDATE public.registrations r
SET status = 'approved'
FROM public.licensees l
JOIN public.licenses lic ON lic.id = l.license_id
JOIN public.applications a ON a.id = lic.application_id
WHERE r.user_id = a.applicant_id
  AND l.status = 'active'
  AND r.status <> 'approved';
```

Expected: ~5 distinct registrations updated (Anisha, Aditi Insurance Pvt Ltd, Naman Domestic Insurnce, Dolorem sunt magni e, Arya Deepti Insurance).
