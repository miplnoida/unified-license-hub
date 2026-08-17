# Fix "Unable to load entities" in complaint intake

## What is wrong

The entity picker on the complaint form calls the backend lookup `search_licensees`. That function requires the signed-in user's profile to carry a regulator assignment, and raises `no_regulator_scope` when it is empty. In the current database 19 of 20 user profiles have no regulator set, so every internal user except one hits the error.

A second, quieter defect: the lookup joins entities to sectors and filters on the sector's regulator, so the 3 entities with no sector linked never appear at all — even for super admins.

## Fix

Rewrite the `search_licensees` lookup so that:

- Authorization is permission-driven: allow the search for super admins and for any user holding a complaints view capability (`complaint_management.view`) or an entity/licensee view capability. Users with none of those still get a clean permission-denied response.
- No dependency on the profile's regulator field. Authorized internal users see all regulated entities (per the confirmed decision).
- Entities with no sector are included; the sector name is simply returned empty.
- The `no_regulator_scope` failure mode disappears for authorized users; the existing error taxonomy in the frontend stays as-is for the remaining cases (auth expired, permission denied, network).

No frontend behaviour changes are required: the picker keeps its search, paging, and total count. The only frontend touch is optional copy cleanup if the now-unreachable scope message needs to stay for other callers — it will be left in place, harmless.

## Verification

- Query the function as the affected Licensing Officer account and confirm it returns all 22 entities, including the 3 without a sector.
- Confirm a user with no complaints/entity view permission still gets a permission error rather than data.
- Open the complaint intake screen in the preview and confirm the entity dropdown lists entities and search filters correctly.

## Technical notes

- Single migration replacing `public.search_licensees(text, integer, integer)`; keeps the same signature and return columns so no client change is needed.
- Keeps `SECURITY DEFINER`, `STABLE`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated` and `service_role`.
- Authorization resolved through the existing helper family (`is_super_admin`, `has_any_permission`) per `docs/rbac/backend-authorization.md`; the sector join becomes a `LEFT JOIN` with no regulator predicate.
