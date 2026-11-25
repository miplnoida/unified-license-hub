import { describe, expect, it, vi } from 'vitest';
import { enrichNames, getEffectiveColumns } from '../../supabase/functions/_shared/report-generator';

function scopedClient(tables: Record<string, Record<string, unknown>[]>, failedTable?: string) {
  const calls: { table: string; ids: unknown[] }[] = [];
  return {
    calls,
    from: vi.fn((table: string) => ({ select: () => ({ in: async (_column: string, ids: unknown[]) => {
      calls.push({ table, ids });
      return { data: (tables[table] ?? []).filter((row) => ids.includes(row.id)), error: table === failedTable ? { message: 'denied' } : null };
    } }) })),
  };
}

describe('examination findings institution names', () => {
  it('includes the resolved institution when stored report definitions have only legacy columns', () => {
    expect(getEffectiveColumns('sup-exam-findings', ['reference', 'title'], [])).toEqual(['reference', 'title', 'entity_name', 'days_overdue', 'remediation_state']);
  });
  it('uses the examination institution and preserves row order without duplicates', async () => {
    const client = scopedClient({ examinations: [{ id: 'exam-1', entity_id: 'entity-1' }], licensees: [{ id: 'entity-1', name: 'Rodney Bay Community Credit Union Ltd' }] });
    const rows = [{ id: 'finding-2', examination_id: 'exam-1' }, { id: 'finding-1', examination_id: 'exam-1' }];
    const result = await enrichNames(client, 'examination_findings', rows);
    expect(result.map((row) => row.id)).toEqual(['finding-2', 'finding-1']);
    expect(result.map((row) => row.entity_name)).toEqual(['Rodney Bay Community Credit Union Ltd', 'Rodney Bay Community Credit Union Ltd']);
    expect(client.calls).toEqual([{ table: 'examinations', ids: ['exam-1'] }, { table: 'licensees', ids: ['entity-1'] }]);
    expect(rows[0]).not.toHaveProperty('entity_id');
  });

  it('does not reveal institutions excluded by caller scope', async () => {
    const client = scopedClient({ examinations: [], licensees: [{ id: 'private-entity', name: 'Restricted institution' }] });
    const result = await enrichNames(client, 'examination_findings', [{ id: 'finding', examination_id: 'private-exam' }]);
    expect(result[0].entity_id).toBeNull();
    expect(result[0].entity_name).toBeUndefined();
    expect(client.calls).toEqual([{ table: 'examinations', ids: ['private-exam'] }]);
  });

  it('keeps existing names while filling other rows', async () => {
    const client = scopedClient({ licensees: [{ id: 'entity-2', name: 'Second institution' }] });
    const result = await enrichNames(client, 'examinations', [{ id: 'a', entity_id: 'entity-1', entity_name: 'Existing institution' }, { id: 'b', entity_id: 'entity-2' }]);
    expect(result.map((row) => row.entity_name)).toEqual(['Existing institution', 'Second institution']);
    expect(client.calls[0].ids).toEqual(['entity-2']);
  });

  it('reports failed institution lookups rather than silently returning an incomplete report', async () => {
    const client = scopedClient({}, 'examinations');
    await expect(enrichNames(client, 'examination_findings', [{ examination_id: 'exam-1' }])).rejects.toThrow('Unable to resolve report examination institutions');
  });

  it('keeps inaccessible institution names blank', async () => {
    const client = scopedClient({ examinations: [{ id: 'exam-1', entity_id: 'private-entity' }], licensees: [] });
    const result = await enrichNames(client, 'examination_findings', [{ examination_id: 'exam-1' }]);
    expect(result[0].entity_name).toBeNull();
  });
});