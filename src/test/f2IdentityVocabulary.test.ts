/**
 * F2-B guardrails — onboarding/identity vocabulary must come from governed
 * catalogues (onboarding_stage_catalogue, entity_membership_status_catalogue),
 * never from hard-coded React literals, and the pending-authority stage must
 * have a live route.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('governed onboarding vocabulary', () => {
  const workspace = read('src/pages/licensing/OnboardingWorkspace.tsx');
  const memberships = read('src/pages/admin/EntityMemberships.tsx');
  const identification = read('src/pages/registration/EntityIdentification.tsx');
  const hook = read('src/hooks/useOnboardingVocabulary.ts');

  it('reads stage and status vocabulary from the database catalogues', () => {
    expect(hook).toContain('onboarding_stage_catalogue');
    expect(hook).toContain('entity_membership_status_catalogue');
  });

  it('has no hard-coded stage or membership-status lists in the UI', () => {
    expect(workspace).not.toContain('const STAGES =');
    expect(workspace).toContain('useOnboardingStages');
    expect(memberships).not.toContain('const STATUS_TABS =');
    expect(memberships).toContain('useMembershipStatuses');
  });

  it('derives journey routing decisions from the catalogue, not literals', () => {
    expect(identification).toContain('useResolvedStageKeys');
    expect(identification).not.toContain("journey.stage === 'AUTHORITY_GRANTED'");
    expect(identification).not.toContain("journey?.stage === 'AUTHORITY_PENDING'");
  });
});

describe('pending authority route exists', () => {
  const routes = read('src/routes/publicRoutes.tsx');

  it('routes the stage resume target returned by the backend', () => {
    expect(routes).toContain('path="/register/authority-pending"');
  });
});
