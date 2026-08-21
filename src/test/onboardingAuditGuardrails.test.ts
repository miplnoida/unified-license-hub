/**
 * Registration & Entity Onboarding Convergence guardrails.
 *
 * The onboarding audit ledger is append-only and server-governed: the browser
 * must never read or write it directly, only through governed RPCs.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

const AUDIT_TABLES = [
  'entity_identity_resolution_events',
  'registration_journey_events',
  'registration_entity_bindings',
  'onboarding_security_metadata',
  'onboarding_alert_signals',
];

describe('onboarding audit guardrails', () => {
  const hook = read('src/hooks/useOnboardingAudit.ts');
  const panel = read('src/components/entity/OnboardingActivityPanel.tsx');
  const workspace = read('src/pages/licensing/OnboardingWorkspace.tsx');

  it('reads audit data only through governed RPCs', () => {
    for (const t of AUDIT_TABLES) {
      expect(hook).not.toContain(`from('${t}')`);
      expect(panel).not.toContain(`from('${t}')`);
      expect(workspace).not.toContain(`from('${t}')`);
    }
    expect(hook).toContain('onboarding_identification_activity');
    expect(hook).toContain('registration_journey_register');
    expect(hook).toContain('entity_onboarding_activity');
  });

  it('exposes both first-class registration journeys', () => {
    expect(hook).toContain('onboarding_form_first_resolve');
    expect(workspace).toContain('FORM_FIRST');
    expect(workspace).toContain('ENTITY_FIRST');
  });

  it('supports administrator search by user and organisation', () => {
    expect(hook).toContain('user?: string');
    expect(hook).toContain('organisation?: string');
    expect(workspace).toContain('Organisation searched');
  });

  it('never renders raw canonical entity identifiers as the primary label', () => {
    // Entity ids are only used for navigation, never surfaced as text.
    expect(panel).not.toMatch(/\{m\.entity_id\}/);
  });
});
