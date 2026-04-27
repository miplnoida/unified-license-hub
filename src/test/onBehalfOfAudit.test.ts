import { describe, it, expect } from 'vitest';

interface ReturnRow {
  submitter_id: string;
  on_behalf_of_licensee_id: string | null;
  license_id: string;
}

function buildReturnRow(actingUserId: string, licenseeId: string, mappedLicensees: string[]): ReturnRow {
  const isPpocAction = mappedLicensees.length > 1;
  return {
    submitter_id: actingUserId,
    license_id: licenseeId,
    on_behalf_of_licensee_id: isPpocAction ? licenseeId : null,
  };
}

describe('PPOC on-behalf-of audit', () => {
  it('records on_behalf_of when PPOC files for a licensee', () => {
    const r = buildReturnRow('ppoc-user', 'lic-A', ['lic-A', 'lic-B']);
    expect(r.on_behalf_of_licensee_id).toBe('lic-A');
    expect(r.submitter_id).toBe('ppoc-user');
  });

  it('does not set on_behalf_of for single-entity submitter', () => {
    const r = buildReturnRow('lic-user', 'lic-A', ['lic-A']);
    expect(r.on_behalf_of_licensee_id).toBeNull();
  });

  it('keeps submitter_id distinct from on_behalf_of_licensee_id', () => {
    const r = buildReturnRow('ppoc-user', 'lic-X', ['lic-X', 'lic-Y']);
    expect(r.submitter_id).not.toBe(r.on_behalf_of_licensee_id);
  });
});
