import { describe, it, expect } from 'vitest';
import { isModuleEnabledFor } from '@/lib/subscriptionPackages';

describe('subscription packages', () => {
  it('Package A hides AML, prudential and enforcement', () => {
    expect(isModuleEnabledFor('aml_supervision', 'PACKAGE_A', {})).toBe(false);
    expect(isModuleEnabledFor('prudential_supervision', 'PACKAGE_A', {})).toBe(false);
    expect(isModuleEnabledFor('enforcement_management', 'PACKAGE_A', {})).toBe(false);
    expect(isModuleEnabledFor('returns_management', 'PACKAGE_A', {})).toBe(true);
  });
  it('Package B adds prudential but not AML', () => {
    expect(isModuleEnabledFor('prudential_supervision', 'PACKAGE_B', {})).toBe(true);
    expect(isModuleEnabledFor('aml_supervision', 'PACKAGE_B', {})).toBe(false);
  });
  it('Package C enables AML', () => {
    expect(isModuleEnabledFor('aml_supervision', 'PACKAGE_C', {})).toBe(true);
  });
  it('overrides add or remove a module', () => {
    expect(isModuleEnabledFor('aml_supervision', 'PACKAGE_A', { aml: true })).toBe(true);
    expect(isModuleEnabledFor('complaint_management', 'PACKAGE_C', { complaints: false })).toBe(false);
  });
  it('core modules cannot be switched off', () => {
    expect(isModuleEnabledFor('settings', 'PACKAGE_A', { core: false })).toBe(true);
  });
});
