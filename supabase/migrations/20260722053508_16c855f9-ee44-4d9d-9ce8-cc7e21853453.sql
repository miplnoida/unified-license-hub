-- Prune scope registry rows for scopes without backing tables.
-- No teams/departments tables exist, so has_scoped_permission denies these
-- branches anyway; removing the seed rows keeps UI + backend in exact parity.
DELETE FROM public.rbac_module_scopes
WHERE (module, scope) IN (
  ('complaint_management', 'team'),
  ('application_management', 'department')
);

-- Also drop any role scope_config entries that reference the pruned scopes,
-- so no active role continues pointing at an unbacked option.
UPDATE public.roles
SET scope_config = scope_config - 'complaint_management'
WHERE scope_config ? 'complaint_management'
  AND (scope_config -> 'complaint_management' ->> 'scope') = 'team';

UPDATE public.roles
SET scope_config = scope_config - 'application_management'
WHERE scope_config ? 'application_management'
  AND (scope_config -> 'application_management' ->> 'scope') = 'department';