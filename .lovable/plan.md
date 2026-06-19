## Problem

When an application reaches its final approval step, a `licenses` row is created by the `provision_application_entity` Postgres function (called from `perform_final_workflow_approval` / `approve-pre-licensee`). That `INSERT` only sets `issued_at` and `valid_from` (column defaults) and **leaves `valid_until` NULL**.

Verified against the latest license created today:

```
LIC-2026-000014 | issued_at 2026-06-19 | valid_until NULL ← bug
LIC-2026-000012 | issued_at 2026-06-02 | valid_until 2026-07-02   (older flow, had 30-day expiry)
```

Because `valid_until` is null, the licensee entity shows no expiry date after final approval, the expiry reminders/banners/reports treat the license as "no expiry", and renewal can never trigger.

The expiry duration is already configured globally in `site_settings.key = 'license_expiry'`:

```
{ cycle_type: 'annual', period_days: 365, grace_period_days: 30, ... }
```

…but `provision_application_entity` never reads it.

## Fix (backend only – data path)

Update the Postgres function `public.provision_application_entity(_application_id)` so that, when it inserts a new license, it computes and stores `valid_from` and `valid_until` from the global `license_expiry` site setting.

### Change in the `INSERT INTO public.licenses (...)` branch

1. Read the config (with safe fallback):
   ```sql
   v_cfg            jsonb := COALESCE(
                       (SELECT value FROM public.site_settings WHERE key = 'license_expiry'),
                       '{}'::jsonb);
   v_period_days    int   := GREATEST(1, COALESCE((v_cfg->>'period_days')::int, 365));
   v_valid_from     timestamptz := now();
   v_valid_until    timestamptz := v_valid_from + make_interval(days => v_period_days);
   ```
2. Add `valid_from` and `valid_until` to the column list and `VALUES` clause of the existing `INSERT INTO public.licenses ...`.
3. No change to the idempotency guard — if a license already exists for the application, leave its dates untouched (renewal is handled by the existing renewal flow).
4. Include `valid_from` / `valid_until` in the `RETURNING` clause and in the JSON response so callers (and certificate generation) see them.

No schema change is required — `valid_until` is already a nullable `timestamptz` and `valid_from` defaults to `now()`.

### One-off data repair (optional, only if you confirm)

For the already-approved application that triggered this report, backfill the missing expiry so the licensee record shows the correct date:

```sql
UPDATE public.licenses
   SET valid_from  = COALESCE(valid_from,  issued_at),
       valid_until = issued_at + INTERVAL '365 days',
       updated_at  = now()
 WHERE license_number = 'LIC-2026-000014'
   AND valid_until IS NULL;
```

(Adjust `365` to match the currently configured `period_days` if you've changed it.)

## Out of scope

- No change to `perform_final_workflow_approval`, `approve-pre-licensee`, the workflow templates, or any frontend code.
- No change to renewal / late-fee / reminder logic — those already read `valid_until` correctly once it's populated.
- No change to historical licenses other than the optional one-row backfill above.

## Verification

1. Approve a new application end-to-end → new `licenses` row has `valid_until = issued_at + period_days` from `site_settings.license_expiry`.
2. Licensee detail view, expiry banner, "License Expiry / Renewal Due" report, and SupervisoryDashboard expiry chart all show the populated date.
3. `provision_application_entity` is still idempotent — re-running it on an already-approved application does not overwrite the existing `valid_until`.

## Questions before I implement

1. Should I also run the one-row backfill for `LIC-2026-000014` as part of this fix?
2. Confirm the global `site_settings.license_expiry.period_days` (currently `365`) is the correct source of truth for every new license — i.e. you don't want per–license-type or per-sector overrides in this change.
