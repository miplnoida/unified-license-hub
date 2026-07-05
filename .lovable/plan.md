## Restore Data API grants across the schema

### Root cause of both issues
`licensees`, `registrations`, and 221 other `public` tables have **no `GRANT`s** to `authenticated` / `service_role`. Without grants, PostgREST (the Data API the frontend uses) returns "permission denied" for every query — the app silently receives empty arrays.

Symptoms this explains:

1. **Licensee Entities blank for internal users** — `supabase.from('licensees').select('*')` (and the joined `sectors`, `sub_sectors`, `categories`, `licenses`, `applications`, `registrations`, `profiles`, `pre_license_users` queries) all return `[]` because none of those tables are grant-visible to `authenticated`. The RLS policies themselves are fine (`Admins manage licensees`, `Licensee users read own`, `PPOC read mapped licensees`).
2. **Licensee Requests: filter broken, newest not first** — `RegistrationReview.tsx` queries `registrations` with `.order('created_at', { ascending: false })` and status filter; both work correctly in code. Query returns `[]` because `registrations` has no grants, so nothing renders and any filter looks broken.

I confirmed this by inspecting `information_schema.role_table_grants` — 223 public tables have zero grants for the API roles. Row counts in the DB are intact.

### Fix (one migration)

1. For every base table in `public` that has no `SELECT/INSERT/UPDATE/DELETE` grant to `authenticated`, run:
   - `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;`
   - `GRANT ALL ON public.<table> TO service_role;`
   
   Existing RLS policies stay untouched, so per-row access remains enforced (admins see admin rows, licensees see their own rows, PPOCs see mapped licensees, etc.).

2. Add `GRANT SELECT ... TO anon` **only** for reference/public-facing tables that already have a permissive public read policy and are needed on unauthenticated pages:
   - `countries`, `states`
   - `master_data_items`, `master_data_types`
   - `registration_form_configs`
   - (`sectors`, `sub_sectors`, `categories`, `services`, `site_settings` already granted in prior migrations.)

   All other tables with a `TO public USING (true)` SELECT policy (e.g. `applications`, `licenses`, `workflow_instances`, `registrations`) are **not** widened to `anon` — those policies were intended for authenticated users; adding `anon` here would expose user data. RLS + authenticated grant is enough.

### Verification
- `Licensee Entities` page loads all 14 licensees for admins.
- `Registration Review` / Licensee Requests page shows pending registrations sorted newest first, filters working.
- No changes to permissions of any specific user role — RLS remains the sole per-row gate.

### Out of scope
- No policy edits, no schema/data changes, no frontend changes.
- Not touching `auth`, `storage`, or other system schemas.
