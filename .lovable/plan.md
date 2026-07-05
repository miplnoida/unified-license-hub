## Sectors, sub-sectors, categories and services look "deleted" — actually a permissions issue

### Diagnosis
The data is intact:

| Table        | Row count |
|--------------|-----------|
| sectors      | 9         |
| sub_sectors  | 8         |
| categories   | 8         |
| services     | 16        |

RLS policies still allow reads (SELECT `true` for anon/authenticated). What's missing are the **table-level `GRANT`s to `anon` / `authenticated` / `service_role`**. Without them, PostgREST (the Data API the app uses) refuses every query with a permission error, so every list in the UI renders empty — which looks exactly like the rows were deleted.

This is a known Supabase gotcha: RLS alone is not enough; each `public` table must be granted to the API roles as well. The rows were never deleted.

### Fix (one migration)

Grant Data API access on the four reference tables to match their existing policies:

- `sectors`, `sub_sectors`, `categories`, `services`:
  - `GRANT SELECT` to `anon` (they are used on public/registration pages) and to `authenticated`
  - `GRANT INSERT, UPDATE, DELETE` to `authenticated` (admin-only writes are enforced by the existing RLS policies)
  - `GRANT ALL` to `service_role`

No schema changes, no policy changes, no data changes. After the migration, the admin lists and the registration sector/sub-sector/category selectors will show the existing rows again.

### Out of scope
- No frontend changes — the UI code is correct; it just can't read the tables today.
- No changes to the 5 security-hardening migrations from the previous turn.
