-- Enforce uniqueness of approval workflows per (regulator, sector, used-for/entity_type).
-- Partial: only when both regulator_id and sector_id are set, to avoid
-- breaking legacy global/null rows. App-level validation handles null cases.
CREATE UNIQUE INDEX IF NOT EXISTS approval_workflows_uniq_reg_sector_entity
  ON public.approval_workflows (regulator_id, sector_id, entity_type)
  WHERE regulator_id IS NOT NULL AND sector_id IS NOT NULL;

COMMENT ON INDEX public.approval_workflows_uniq_reg_sector_entity IS
  'Prevents duplicate approval workflows for the same Sector + Used For (entity_type) within a regulator.';