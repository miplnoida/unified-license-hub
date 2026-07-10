## Problem

`/conduct/investigations` lists nothing even though `conduct_investigations` has 5 rows in the database (including the ones you just opened). The list query is:

```ts
sb.from('conduct_investigations').select('*, licensees(name)')...
```

`conduct_investigations.licensee_id` is a plain `uuid` column with **no foreign key** to `public.licensees`. PostgREST needs an FK to auto-embed a related table, so the whole request fails and the hook returns an empty array. The same problem will hit the investigation detail page (`useInvestigation`), which uses the same embed.

## Fix

Single migration that adds the missing FK so PostgREST can resolve the embed:

```sql
ALTER TABLE public.conduct_investigations
  ADD CONSTRAINT conduct_investigations_licensee_id_fkey
  FOREIGN KEY (licensee_id) REFERENCES public.licensees(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
```

No frontend changes required — `useInvestigations` / `useInvestigation` will start returning rows immediately, and the entity-name column in the table will populate.

## Verification

1. Reload `/conduct/investigations` — the 5 existing rows plus any newly opened ones render, with entity names shown.
2. Click one to confirm the detail page (also uses the same embed) loads.
