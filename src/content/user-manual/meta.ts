import type { ManualMeta } from './types';

/**
 * Manual identity and freshness record.
 *
 * `repositoryHead` is the code baseline the manual was written and screenshots
 * were captured against. It is refreshed by the final E2E documentation wave
 * (see docs/user-manual/FINAL-E2E-REFRESH.md).
 */
export const MANUAL_META: ManualMeta = {
  version: '1.0.0',
  generatedDate: '2026-08-30',
  verifiedDate: '2026-08-30',
  repositoryHead: '2f3b9d9c18e8167ad6cbb2afe48d83b10d45e183',
  certificationStatus:
    'Modules F0–F7 certified and frozen. F8A-B1 and F8A-B2 (ownership traversal & UBO) closed. F8/F9 and later waves not certified.',
  lastE2eVerifiedHead: null,
  manualStatus: 'INTERIM — TO BE RE-VERIFIED AFTER FINAL E2E',
  route: '/help/user-manual',
  menuLocation: 'Sidebar → Home → Help & User Manual (sec_navigation_items key `nav_help_user_manual`)',
};

/** Certified/closed module baselines the manual is allowed to describe as available. */
export const CERTIFIED_MODULES: { module: string; state: string }[] = [
  { module: 'F0 Platform foundation', state: 'CERTIFIED & FROZEN' },
  { module: 'F1 Identity, RBAC & navigation', state: 'CERTIFIED & FROZEN' },
  { module: 'F2 Forms & configuration', state: 'CERTIFIED & FROZEN' },
  { module: 'F3 Registration & onboarding', state: 'CERTIFIED & FROZEN' },
  { module: 'F4 Licensing', state: 'CERTIFIED & FROZEN' },
  { module: 'F5 Post-licensing services', state: 'CERTIFIED & FROZEN' },
  { module: 'F6 Fees, payments & multi-currency', state: 'CERTIFIED & FROZEN' },
  { module: 'F7 Regulatory returns', state: 'CERTIFIED & FROZEN' },
  { module: 'F8A-B1 Canonical relationship foundation', state: 'CLOSED' },
  { module: 'F8A-B2 Ownership traversal & UBO', state: 'CLOSED' },
  { module: 'F8 Prudential supervision (consolidated)', state: 'NOT CERTIFIED — implementation present' },
  { module: 'F9 Fit & proper (consolidated)', state: 'NOT CERTIFIED — implementation present' },
  { module: 'F19/F20 Whole-system E2E certification', state: 'PENDING — manual refresh contract recorded' },
];
