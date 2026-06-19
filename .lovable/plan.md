## Update Approved Licensee Expiry to 30 Days from Registration

Set `valid_until` on every license whose licensee is in `active`/`approved` status to **registration date + 30 days**, leaving all other fields untouched.

### Scope

- **Target rows:** rows in `public.licenses` whose linked `licensees.status = 'active'` (the "approved" state).
- **Registration date source priority** (first non-null wins):
  1. `licenses.issued_at` (issue date of the license)
  2. `licenses.created_at` (fallback)
- **Field updated:** `licenses.valid_until` only.
- **Status:** not changed. If the new `valid_until` falls in the past, the existing expiry banner/renewal flow already handles "expired" UX — no status flip in this task.

### What is NOT changed

- Licensee records, certificates, renewals, notifications, audit logs.
- License expiry **configuration** (`site_settings.license_expiry`) — cycle stays whatever admin set; this is a one-time data correction for existing approved entities.
- Any future approvals — new licenses continue to use the configured cycle.

### Technical

Single data update via the insert tool:

```sql
UPDATE public.licenses l
SET valid_until = (COALESCE(l.issued_at, l.created_at)::date + INTERVAL '30 days')
FROM public.licensees e
WHERE e.license_id = l.id
  AND e.status = 'active';
```

### Verification

After update, run a `SELECT` sample of `license_number, issued_at, valid_until` to confirm the 30-day delta.
