import { describe, it, expect } from 'vitest';
import { isModuleEnabledFor, PACKAGE_FEATURES } from '@/lib/subscriptionPackages';
import { KNOWN_PERMISSION_MODULES } from '@/lib/permissionModules';

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
  it.each(['PACKAGE_A', 'PACKAGE_B', 'PACKAGE_C'] as const)('denies unknown modules in %s', (tier) => {
    expect(isModuleEnabledFor('unregistered_module', tier, { unregistered_module: true })).toBe(false);
  });
  it('classifies every known permission module before default-deny', () => {
    const mapped = new Set(PACKAGE_FEATURES.flatMap((feature) => feature.modules));
    for (const module of KNOWN_PERMISSION_MODULES) expect(mapped.has(module), module).toBe(true);
  });
  it('keeps licensing and compliance aliases in Package A', () => {
    expect(isModuleEnabledFor('licensing', 'PACKAGE_A', {})).toBe(true);
    expect(isModuleEnabledFor('compliance_management', 'PACKAGE_A', {})).toBe(true);
  });
  it('applies reporting overrides to executive oversight', () => {
    expect(isModuleEnabledFor('executive_oversight', 'PACKAGE_A', {})).toBe(true);
    expect(isModuleEnabledFor('executive_oversight', 'PACKAGE_C', { reports: false })).toBe(false);
  });
  it('includes payment-system supervision only in B and C', () => {
    expect(isModuleEnabledFor('prudential_payment_systems', 'PACKAGE_A', {})).toBe(false);
    expect(isModuleEnabledFor('prudential_payment_systems', 'PACKAGE_B', {})).toBe(true);
  });
});
