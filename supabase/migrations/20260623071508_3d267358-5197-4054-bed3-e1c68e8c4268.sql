DROP INDEX IF EXISTS public.approval_workflows_unique_scope_used_for;

CREATE UNIQUE INDEX approval_workflows_unique_scope_used_for
ON public.approval_workflows USING btree (
  COALESCE((regulator_id)::text, '__global__'::text),
  COALESCE((sector_id)::text, '__all_sectors__'::text),
  COALESCE((sub_sector_id)::text, '__all_sub_sectors__'::text),
  COALESCE((category_id)::text, '__all_categories__'::text),
  COALESCE((service_id)::text, '__all_services__'::text),
  entity_type
) WHERE (is_active = true);