## Fix "column reference case_number is ambiguous" on Open Enforcement Case

**Root cause:** The RPC `public.escalate_complaint_to_enforcement` declares an OUT column named `case_number` (via `RETURNS TABLE(..., case_number text)`). Inside the function, `RETURNING id, case_number INTO new_ea_id, new_case_number` references the `enforcement_actions.case_number` column, but Postgres also sees the OUT parameter `case_number` in scope — so the identifier is ambiguous and the RPC aborts with SQLSTATE 42702 before any row is inserted (transaction rolls back).

Same latent risk in the `INSERT ... RETURNING` and the later assignment `case_number := new_case_number;` (the latter is fine syntactically but relies on the OUT name).

### Change

One migration redefining `public.escalate_complaint_to_enforcement` (unchanged signature, security, grants, and behavior) with the ambiguity removed:

- Qualify the RETURNING reference: `RETURNING id, public.enforcement_actions.case_number INTO new_ea_id, new_case_number` (or equivalently alias the table in a CTE). This is the only functional change.
- Keep the OUT column name `case_number` so the client (`ComplaintDetail.tsx` reads `data.case_number`) is unaffected.

### Not changing
- No client code changes.
- No schema changes to `enforcement_actions` or `complaints`.
- No change to permissions, audit payload, or event insert.
