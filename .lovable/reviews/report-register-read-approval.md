# Approval memo — read access for two report registers

Prepared 25 November 2026. Nothing here has been applied.

## Confirmed defect

Two reports in the Report Library refuse to open for a signed-in officer:

| Report | Server response |
|---|---|
| Approved Persons & Key Functionaries Register | `{"ok":false,"error":"permission denied for table entity_appointments"}` |
| Ownership, Control & Beneficial Owners Register | `{"ok":false,"error":"permission denied for table ownership_interests"}` |

Both were reproduced through the normal Report Library screen with the signed-in
officer account. The other 44 catalogue reports opened and returned rows.

## Cause (direct evidence)

`generate-report` runs the report query with the caller's own session, so the
database decides what that officer may read. Three tables the two reports need
have no read grant for normal signed-in app users (`authenticated`):

| Table | Role in the reports | Read grant for signed-in users | Row-level security |
|---|---|---|---|
| `entity_appointments` | source rows for the Approved Persons register | **missing** | enabled |
| `ownership_interests` | source rows for the Ownership/UBO register | **missing** | enabled |
| `parties` | turns `person_party_id` / `owner_party_id` into a person name | **missing** | enabled |

The lookup tables `licensees`, `role_types` and `ownership_types` already carry
the grant, so only these three are involved.

The failing message is a table-grant refusal, not a row-level-security refusal:
the tables already have read policies, they simply cannot be reached.

## Exact SQL requested

```sql
-- Read-only access for signed-in app users. No write access, no new roles,
-- no row-level-security policy created, altered or dropped.
GRANT SELECT ON TABLE public.entity_appointments TO authenticated;
GRANT SELECT ON TABLE public.ownership_interests TO authenticated;
GRANT SELECT ON TABLE public.parties TO authenticated;
```

Rollback:

```sql
REVOKE SELECT ON TABLE public.entity_appointments FROM authenticated;
REVOKE SELECT ON TABLE public.ownership_interests FROM authenticated;
REVOKE SELECT ON TABLE public.parties FROM authenticated;
```

## Security impact

- **Grants a table-level read, not a data-level read.** Row-level security stays
  the boundary. A signed-in user only sees rows an existing policy already
  allows:
  - `entity_appointments` → `has_permission(entity_structure view)` **or**
    `has_permission(fit_and_proper view)` **or** `wb_entity_member(entity_id)`.
  - `ownership_interests` → `has_permission(entity_structure view)` **or**
    `wb_entity_member(owned_entity_id)`.
  - `parties` → super admin, `licensee_management view_all_entities`, a licensee
    the caller may read, **or** appointment/ownership context the caller may see.
- **No new capability.** These are the same policies the Entities, Person 360 and
  Entity 360 screens already rely on; the grant only makes the same rows readable
  from the report query path.
- **Write access unchanged.** No INSERT/UPDATE/DELETE/TRUNCATE is granted to
  `authenticated`, `anon` or any other role.
- **No effect on applicants or the public.** Anonymous (`anon`) users gain
  nothing; they still cannot reach these tables.
- **No effect on protected records.** No row is inserted, updated, deleted or
  re-keyed. AML/CFT methodology, policy and assessment tables are untouched.
- **Fail-closed behavior preserved.** The generator still throws when a lookup
  fails, so a report cannot silently publish a partial population.

## Acceptance test once approved

1. Signed-in officer opens both reports from the Report Library; each returns a
   preview with a row count and no error toast.
2. A signed-in user without `entity_structure`/`fit_and_proper` view and without
   institution membership still receives no rows.
3. The other 44 catalogue reports continue to open unchanged.

## Related observation — not requested, not applied

393 public tables currently grant anonymous (`anon`) write privileges
(INSERT/UPDATE/DELETE/TRUNCATE). Every one inspected has row-level security
enabled, and the write policies found are restrictive (`with_check false`,
explicit "no delete/no update" policies, plus one intentional public
registration-upload insert on `file_uploads`), so this was **not** shown to be
exploitable. It is still broader than the application needs. A separate
revocation memo can be prepared if you want that hardened.
