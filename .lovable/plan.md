## Show Licensee Entities to all internal staff

### Root cause
The `licensees` table has only three RLS policies:

- `Admins manage licensees` — ALL for `super_admin`/`admin`
- `Licensee users read own` — external licensee users
- `PPOC read mapped licensees` — PPOCs

There is **no SELECT policy for other internal roles** (`supervisor`, `licensing_officer`, `analyst`, `legal_compliance`). RLS defaults to deny, so those staff users get zero rows even though grants are now correct.

### Fix (one migration)
Add a read-only SELECT policy on `public.licensees` for the remaining internal roles:

```sql
CREATE POLICY "Internal staff read licensees"
ON public.licensees FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'licensing_officer'::app_role)
  OR has_role(auth.uid(), 'analyst'::app_role)
  OR has_role(auth.uid(), 'legal_compliance'::app_role)
);
```

super_admin/admin continue to have full access via the existing ALL policy; external users are unchanged.

### Not touched
- No writes granted to the added roles — only SELECT.
- No frontend changes.
- No other tables.
