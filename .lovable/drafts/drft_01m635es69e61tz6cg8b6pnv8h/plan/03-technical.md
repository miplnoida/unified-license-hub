## Technical details

### Proposed migration (staged, additive)

```sql
-- 1. Single membership rule, reused by list and detail.
CREATE OR REPLACE FUNCTION public.app_entity_member_application_ids(_user uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id
  FROM public.applications a
  JOIN public.entity_user_memberships m
    ON m.entity_id = a.entity_id
  WHERE _user IS NOT NULL
    AND a.entity_id IS NOT NULL
    AND m.user_id = _user
    AND m.status = 'APPROVED'
    AND m.revoked_at IS NULL
    AND m.effective_from <= now()
    AND (m.effective_to IS NULL OR m.effective_to > now())
$$;
REVOKE ALL ON FUNCTION public.app_entity_member_application_ids(uuid) FROM PUBLIC, anon;
```

```sql
-- 2. get_application_list_page: CREATE OR REPLACE with the current
--    definition copied verbatim (same signature, return table, filters,
--    ordering, paging, draft exclusion). Only change: one extra branch
--    at the end of the linked_applications CTE:
    UNION
    SELECT x AS application_id
    FROM public.app_entity_member_application_ids(v_uid) x
```

```sql
-- 3. Option A only. can_read_application: CREATE OR REPLACE with the current
--    definition verbatim plus one extra OR inside the EXISTS:
           OR a.id IN (SELECT public.app_entity_member_application_ids(_user))
```

`can_mutate_application`, `external_can_access_application`, `has_portal_capability`, policies, grants and roles are not touched. The existing profile-link and PPOC branches stay exactly as they are, so nobody loses access. The new branch never uses them. It requires an approved, in-force, unrevoked membership.

### Security impact
- **New visibility:** current approved members of an institution can read applications whose `entity_id` is that institution. That includes applications submitted by someone else, and both pre-licensing and post-licence requests.
- **Not granted:** revoked, expired, pending or rejected members; members of other institutions; applicants with no membership. `UNION` removes duplicates.
- **Actions unchanged:** edit, withdraw, resubmit, RFI response and approval go through `can_mutate_application` and workflow permissions, which this change doesn't touch.
- **Data exposed on open:** submitted forms, acknowledgements, RFIs and the AI assessment row follow `can_read_application`. I will check application documents, history and payments policies one by one and report any that use a different check. I won't widen them without asking.

### Rollback
A second staged migration that re-applies the two captured original function definitions verbatim and drops `app_entity_member_application_ids`. No data is changed, so nothing needs to be restored.

### Regression tests (SQL, inside a rolled-back transaction, TEST fixtures only)
1. An approved member sees the entity's INITIAL and POST_LICENSE applications, and the counts match.
2. That member can read the INITIAL application's detail (option A) but `can_mutate_application` stays false.
3. A revoked or expired member, and a member of another entity, see none of them.
4. The original applicant still sees and can mutate their own drafts as before.
5. No duplicate rows, and total counts match the rows across pages.
6. Status and sector filters still apply.

Plus a re-run of the existing applications-list Vitest suite. I'll report the results before you're asked to approve applying the change.
