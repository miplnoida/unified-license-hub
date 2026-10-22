import { describe, it, expect } from 'vitest';
import { matchPostLicenseTemplates } from '@/lib/postLicenseFormMatch';

const SUB = 'cu-sub';
const mk = (id: string, service_id: string | null) => ({
  id, status: 'published', form_type: 'post_license', service_id, sub_sector_id: SUB, sector_id: 'cu',
});
const all15 = Array.from({ length: 15 }, (_, i) => mk(`f${i}`, `svc${i}`));

describe('matchPostLicenseTemplates', () => {
  it('keeps only the chosen service form when the server returns the whole sub-sector set', () => {
    const r = matchPostLicenseTemplates({
      templates: all15, serverFormIds: all15.map(t => t.id), serviceId: 'svc14', sectorId: 'cu', subSectorId: SUB,
    });
    expect(r.map(t => t.id)).toEqual(['f14']);
  });

  it('finds the service form even without a server form set', () => {
    const r = matchPostLicenseTemplates({
      templates: all15, serverFormIds: null, serviceId: 'svc3', sectorId: 'cu', subSectorId: SUB,
    });
    expect(r.map(t => t.id)).toEqual(['f3']);
  });

  it('returns nothing when the templates list lacks the forms (wrong regulator loaded)', () => {
    const r = matchPostLicenseTemplates({
      templates: [], serverFormIds: all15.map(t => t.id), serviceId: 'svc3', sectorId: 'cu', subSectorId: SUB,
    });
    expect(r).toEqual([]);
  });
});
