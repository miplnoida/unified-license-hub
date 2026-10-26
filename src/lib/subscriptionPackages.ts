import type { PermissionModule } from '@/lib/permissionModules';

export type PackageTier = 'PACKAGE_A' | 'PACKAGE_B' | 'PACKAGE_C';
export const PACKAGE_ORDER: PackageTier[] = ['PACKAGE_A', 'PACKAGE_B', 'PACKAGE_C'];

/** Commercial feature groups. Each maps to one or more permission modules. */
export interface PackageFeature {
  key: string;
  label: string;
  description: string;
  /** Lowest tier that includes this feature; null = platform core (always on). */
  tier: PackageTier | null;
  modules: PermissionModule[];
}

export const PACKAGE_FEATURES: PackageFeature[] = [
  { key: 'core', label: 'Platform core', description: 'Administration, users, roles, forms, workflows, notifications, settings, audit.', tier: null,
    modules: ['admin_dashboard', 'user_management', 'role_management', 'form_management', 'workflow_management', 'settings', 'notification_management', 'audit_management', 'security_management', 'integration_management', 'rule_engine', 'regulatory_data_model', 'support_management' as PermissionModule] },
  { key: 'licensing', label: 'Registration & licensing', description: 'Registration, applications, fees, licences, entity registry and onboarding.', tier: 'PACKAGE_A',
    modules: ['registration_management', 'application_management', 'license_management', 'fee_management', 'licensee_management' as PermissionModule, 'entity_resolution', 'entity_membership', 'entity_structure' as PermissionModule, 'onboarding', 'document_management'] },
  { key: 'returns', label: 'Regulatory returns', description: 'Return configuration, filing, validation and review.', tier: 'PACKAGE_A', modules: ['returns_management'] },
  { key: 'complaints', label: 'Consumer complaints', description: 'Complaint intake, investigation and outcomes.', tier: 'PACKAGE_A', modules: ['complaint_management', 'complaint_type'] },
  { key: 'reports', label: 'Reports & dashboards', description: 'Standard reports and analytics.', tier: 'PACKAGE_A', modules: ['report_management'] },
  { key: 'fit_proper', label: 'Fit & Proper', description: 'Screening, committees and determinations.', tier: 'PACKAGE_B',
    modules: ['fit_and_proper', 'fit_and_proper_initiation', 'fit_and_proper_screening', 'fit_and_proper_committee'] },
  { key: 'prudential', label: 'Prudential supervision', description: 'Risk-based supervision, early warnings, breaches, plans and examinations.', tier: 'PACKAGE_B',
    modules: ['prudential_supervision', 'supervisory_spine', 'inspection_management' as PermissionModule, 'escalation_management'] },
  { key: 'conduct', label: 'Market conduct', description: 'Conduct monitoring, thematic reviews and investigations.', tier: 'PACKAGE_B',
    modules: ['market_conduct', 'market_conduct_investigation', 'coordination'] },
  { key: 'aml', label: 'AML/CFT supervision', description: 'AML/CFT risk assessments and methodology.', tier: 'PACKAGE_C', modules: ['aml_supervision'] },
  { key: 'enforcement', label: 'Enforcement & appeals', description: 'Enforcement cases, sanctions and appeal panels.', tier: 'PACKAGE_C',
    modules: ['enforcement_management' as PermissionModule, 'license_appeals'] },
  { key: 'ai', label: 'AI & advanced analytics', description: 'AI insights and governance.', tier: 'PACKAGE_C', modules: ['ai_management'] },
];

export const PACKAGE_INFO: Record<PackageTier, { name: string; summary: string }> = {
  PACKAGE_A: { name: 'Package A — Core Regulatory Foundation', summary: 'Licensing, returns, complaints and standard reports.' },
  PACKAGE_B: { name: 'Package B — Comprehensive Supervision', summary: 'Everything in A plus Fit & Proper, prudential and conduct supervision.' },
  PACKAGE_C: { name: 'Package C — Advanced SupTech & Enforcement', summary: 'Everything in B plus AML/CFT, enforcement, appeals and AI.' },
};

export type FeatureOverrides = Record<string, boolean>;

export function featureIncluded(f: PackageFeature, pkg: PackageTier): boolean {
  if (!f.tier) return true;
  return PACKAGE_ORDER.indexOf(pkg) >= PACKAGE_ORDER.indexOf(f.tier);
}

export function isFeatureEnabled(f: PackageFeature, pkg: PackageTier, overrides: FeatureOverrides): boolean {
  if (!f.tier) return true; // core can never be switched off
  if (typeof overrides[f.key] === 'boolean') return overrides[f.key];
  return featureIncluded(f, pkg);
}

/** Modules not mentioned by any feature are treated as enabled. */
export function isModuleEnabledFor(module: string | null | undefined, pkg: PackageTier, overrides: FeatureOverrides): boolean {
  if (!module) return true;
  const owners = PACKAGE_FEATURES.filter((f) => (f.modules as string[]).includes(module));
  if (owners.length === 0) return true;
  return owners.some((f) => isFeatureEnabled(f, pkg, overrides));
}
