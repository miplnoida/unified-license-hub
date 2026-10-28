import { describe, expect, it } from 'vitest';
import { canDiscoverSupervisoryNavigation, isSupervisoryNavigationPath } from '@/lib/supervisoryNavigation';
import { getModuleForPath } from '@/lib/permissionModules';
describe('supervision menu authority', () => {
  it('uses cross-domain supervisory view without granting unrelated staff access', () => {
    expect(canDiscoverSupervisoryNavigation(true, false, (m, a) => m === 'aml_supervision' && a === 'view')).toBe(true);
    expect(canDiscoverSupervisoryNavigation(true, false, m => m === 'returns_management')).toBe(false);
    expect(canDiscoverSupervisoryNavigation(false, false, () => true)).toBe(false);
  });
  it('binds both existing pages to package-aware supervisory metadata', () => {
    for (const path of ['/supervision/detection', '/supervision/management-assurance']) {
      expect(isSupervisoryNavigationPath(path)).toBe(true);
      expect(getModuleForPath(path)).toBe('supervisory_spine');
    }
    expect(isSupervisoryNavigationPath('/supervision/unknown')).toBe(false);
  });
});