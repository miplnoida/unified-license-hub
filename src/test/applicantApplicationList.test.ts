import { describe, it, expect } from 'vitest';
import { fetchAllListPages, attachRequestKinds, sectorParamForAudience } from '@/lib/applicantApplicationList';
import { isPostLicenseApplicationRow } from '@/lib/applicationCategory';

describe('applicant application list', () => {
  it('returns every row beyond the 200-row server page cap', async () => {
    const all = Array.from({ length: 450 }, (_, i) => ({ id: `a${i}`, total_count: 450 }));
    const rows = await fetchAllListPages(async (p, size) => ({ data: all.slice(p * size, p * size + size), error: null }));
    expect(rows).toHaveLength(450);
  });

  it('applicants are not sector-scoped; staff keep the sector', () => {
    expect(sectorParamForAudience(false, 'sec-1')).toBeNull();
    expect(sectorParamForAudience(true, 'sec-1')).toBe('sec-1');
  });

  it('INITIAL is pre-licensing even when a service_id is present', () => {
    const [row] = attachRequestKinds([{ id: 'x', service_id: 's1' }], { x: 'INITIAL' });
    expect(isPostLicenseApplicationRow(row)).toBe(false);
  });

  it('POST_LICENSE is post-licensing', () => {
    const [row] = attachRequestKinds([{ id: 'y' }], { y: 'POST_LICENSE' });
    expect(isPostLicenseApplicationRow(row)).toBe(true);
  });
});
