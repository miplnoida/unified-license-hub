## Make anisha.k2@yopmail.com's license expired

Found user: `anisha.k2@yopmail.com` (id `817c85c1-114b-41e0-8da2-314c55f87c42`)
- Licensee: `8e3ffcec-8270-478d-861e-da60f025e3b3`
- License: `LIC-2026-000014` (id `7a5b3197-49cc-49ea-a1fd-ca94434cb005`)
- Current `valid_until`: 2027-06-19 (active)

### Change
Single UPDATE to `licenses` row id `7a5b3197-49cc-49ea-a1fd-ca94434cb005`:
- Set `valid_until = '2024-01-01'` (well past any grace period, so it resolves to `expired` and Renew becomes available)
- Leave `status = 'active'` (the validity helper derives expired/grace from `valid_until` + policy)
- No other records touched

```sql
UPDATE public.licenses
SET valid_until = '2024-01-01'
WHERE id = '7a5b3197-49cc-49ea-a1fd-ca94434cb005';
```

Confirm to apply.