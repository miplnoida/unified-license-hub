// Shared helper to detect duplicate approval workflows.
// A duplicate is any existing workflow with the same
// (regulator_id, sector_id, sub_sector_id, category_id, service_id, entity_type)
// tuple. NULLs are compared as equal (so two "global" workflows for the same
// regulator collide). `excludeId` lets callers ignore the workflow being edited
// so it does not flag itself.

export interface DuplicateCandidate {
  id?: string;
  regulator_id: string | null;
  sector_id: string | null;
  sub_sector_id?: string | null;
  category_id?: string | null;
  service_id?: string | null;
  entity_type: string;
}

export function findDuplicateWorkflow<T extends DuplicateCandidate>(
  existing: T[],
  candidate: DuplicateCandidate,
  excludeId?: string | null,
): T | null {
  return (
    existing.find(
      (w) =>
        (!excludeId || w.id !== excludeId) &&
        (w.regulator_id ?? null) === (candidate.regulator_id ?? null) &&
        (w.sector_id ?? null) === (candidate.sector_id ?? null) &&
        (w.sub_sector_id ?? null) === (candidate.sub_sector_id ?? null) &&
        (w.category_id ?? null) === (candidate.category_id ?? null) &&
        (w.service_id ?? null) === (candidate.service_id ?? null) &&
        w.entity_type === candidate.entity_type,
    ) || null
  );
}

export const DUPLICATE_WORKFLOW_MESSAGE =
  'Workflow already exists for this scope and used-for type.';
