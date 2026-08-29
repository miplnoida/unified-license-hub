/**
 * Module → Record-scope capability registry.
 *
 * This is the SINGLE SOURCE OF TRUTH for which scope options each module
 * actually supports on the backend. The UI must never offer a scope option
 * that is not listed here, and the backend `rbac_module_scopes` seed table
 * mirrors this file exactly. If a module has no meaningful record-level
 * scoping (e.g. Settings, Role Management), its entry is `['all']` and
 * the UI hides the scope selector entirely.
 *
 * Selectors describe which entity IDs the admin must pick when a scope is
 * chosen. E.g. scope='sector' with `selector:'sectors'` means the admin
 * picks one or more sector IDs; the backend enforces membership.
 */
export type ScopeKind =
  | 'all'
  | 'assigned'
  | 'sector'
  | 'institution'
  | 'own';

export type ScopeSelector = 'sectors' | 'licensees' | null;

export interface ScopeOption {
  kind: ScopeKind;
  label: string;
  help: string;
  /** Which entity IDs the administrator must pick to make this scope concrete. */
  selector: ScopeSelector;
}

export interface ModuleScopeCapability {
  module: string;
  label: string;
  options: ScopeOption[];
  /** True when the backend has no scope wiring for this module yet — UI hides the selector. */
  scopeless?: boolean;
}

// NOTE: 'team' and 'department' scope kinds are intentionally omitted. No
// backing tables exist for them, and public.user_scope_for treats any such
// entry as no-contribution (never widens access). Do not add them back
// without also landing the backing tables, RLS helpers, and pgTAP.
const OPT: Record<ScopeKind, Omit<ScopeOption, 'selector'>> = {
  all:         { kind: 'all',         label: 'All records',           help: 'See every record in this module (default).' },
  assigned:    { kind: 'assigned',    label: 'Assigned only',         help: 'Only records assigned to this user (regulator, officer, alternate).' },
  sector:      { kind: 'sector',      label: 'Selected sectors',      help: 'Records whose licensee belongs to specific sectors.' },
  institution: { kind: 'institution', label: 'Selected institutions', help: 'Records for a specific list of licensees / institutions.' },
  own:         { kind: 'own',         label: 'Own records only',      help: 'Only records the user created.' },
};

const mk = (kind: ScopeKind, selector: ScopeSelector = null): ScopeOption => ({ ...OPT[kind], selector });

/**
 * Backend-verified capability matrix. Any scope option added here must have
 * matching enforcement in RLS / RPC / storage — the parity script fails CI
 * when this file drifts from `public.rbac_module_scopes`.
 */
export const MODULE_SCOPE_CAPABILITIES: ModuleScopeCapability[] = [
  { module: 'returns_management',    label: 'Returns',      options: [mk('all'), mk('assigned'), mk('institution', 'licensees'), mk('sector', 'sectors')] },
  // NOTE: 'team' scope removed until a backing teams table exists — has_scoped_permission denies it anyway.
  { module: 'complaint_management',  label: 'Complaints',   options: [mk('all'), mk('assigned')] },
  { module: 'market_conduct',        label: 'Market Conduct', options: [mk('all'), mk('assigned'), mk('sector', 'sectors')] },
  // NOTE: 'department' scope removed until a backing departments table exists.
  { module: 'application_management',label: 'Applications', options: [mk('all'), mk('assigned')] },
  { module: 'licensee_management',   label: 'Licensees',    options: [mk('all'), mk('assigned'), mk('institution', 'licensees'), mk('sector', 'sectors')] },
  { module: 'license_management',    label: 'Licenses',     options: [mk('all'), mk('assigned'), mk('institution', 'licensees')] },
  { module: 'registration_management', label: 'Registrations', options: [mk('all'), mk('assigned')] },
  { module: 'prudential_supervision', label: 'Prudential',  options: [mk('all'), mk('assigned'), mk('institution', 'licensees'), mk('sector', 'sectors')] },
  { module: 'fit_and_proper',        label: 'Fit & Proper', options: [mk('all'), mk('assigned'), mk('institution', 'licensees')] },
  { module: 'enforcement',           label: 'Enforcement',  options: [mk('all'), mk('assigned')] },
  { module: 'inspection_management', label: 'Inspections',  options: [mk('all'), mk('assigned'), mk('institution', 'licensees')] },
  { module: 'compliance_returns',    label: 'Compliance',   options: [mk('all'), mk('assigned'), mk('institution', 'licensees')] },
  { module: 'fee_management',        label: 'Fees & Payments', options: [mk('all'), mk('assigned')] },
  { module: 'form_management',       label: 'Forms',        options: [mk('all'), mk('own')] },
  { module: 'audit_management',      label: 'Audit',        options: [mk('all')], scopeless: true },
  { module: 'settings',              label: 'Settings',     options: [mk('all')], scopeless: true },
  { module: 'role_management',       label: 'Roles & Permissions', options: [mk('all')], scopeless: true },
  { module: 'notification_management', label: 'Notifications', options: [mk('all')], scopeless: true },
  { module: 'reports_management',    label: 'Reports',      options: [mk('all'), mk('assigned'), mk('sector', 'sectors')] },
];

const BY_MODULE = new Map(MODULE_SCOPE_CAPABILITIES.map(c => [c.module, c]));

export function getScopeCapability(moduleKey: string): ModuleScopeCapability | undefined {
  return BY_MODULE.get(moduleKey);
}

export function isScopeOptionAllowed(moduleKey: string, kind: ScopeKind): boolean {
  const cap = BY_MODULE.get(moduleKey);
  if (!cap) return kind === 'all';
  return cap.options.some(o => o.kind === kind);
}

export function requiredSelectorFor(moduleKey: string, kind: ScopeKind): ScopeSelector {
  const cap = BY_MODULE.get(moduleKey);
  return cap?.options.find(o => o.kind === kind)?.selector ?? null;
}
