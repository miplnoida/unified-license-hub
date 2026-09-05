import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import {
  CANONICAL_ENGAGEMENT_TYPES,
  ENGAGEMENT_TYPE_VALUES,
  engagementLabel,
  engagementMode,
  engagementPhrasing,
  examinationWorkLabel,
  examinationWorkTerm,
  interventionExecutionContract,
  isCanonicalEngagementType,
  isExaminationBackedIntervention,
  isOffsiteEngagement,
  lightweightExecutionGuidance,
} from '@/lib/supervisoryEngagement';

/**
 * OSUI-01…15 — offsite supervision is the same object seen through the same
 * screens. These gates hold the browser to the server's vocabulary and to the
 * "one object, many views" rule: no offsite workspace, no offsite panel fork,
 * no client-side authorisation.
 */
const activity = readFileSync('src/components/supervision/aml/AmlSupervisoryActivity.tsx', 'utf8');
const actionDialog = readFileSync('src/components/supervision/aml/AmlActionDialog.tsx', 'utf8');
const contractHook = readFileSync('src/hooks/useSupervisoryActivityContract.ts', 'utf8');
const engagementHook = readFileSync('src/hooks/useExaminationEngagement.ts', 'utf8');
const examHook = readFileSync('src/hooks/useExaminations.ts', 'utf8');
const examList = readFileSync('src/pages/prudential/ExaminationsList.tsx', 'utf8');
const routes = readFileSync('src/routes/dashboardRoutes.tsx', 'utf8');

const PANEL_DIR = 'src/components/prudential/examination';
const panels = readdirSync(PANEL_DIR).filter((f) => f.endsWith('.tsx'));

describe('OSUI-01 — the engagement vocabulary is the server vocabulary', () => {
  it('OSUI-01 offers exactly the six canonical engagement types', () => {
    expect(ENGAGEMENT_TYPE_VALUES).toEqual([
      'FULL_SCOPE_ONSITE',
      'TARGETED_ONSITE',
      'OFFSITE_REVIEW',
      'FOLLOW_UP_REVIEW',
      'JOINT_EXAMINATION',
      'THEMATIC_EXAMINATION',
    ]);
    expect(CANONICAL_ENGAGEMENT_TYPES.every((e) => e.label.trim().length > 0)).toBe(true);
  });

  it('OSUI-02 rejects display aliases as engagement values', () => {
    ['targeted', 'full_scope', 'follow_up', 'thematic', 'OFFSITE', 'Offsite Review'].forEach((alias) => {
      expect(isCanonicalEngagementType(alias)).toBe(false);
    });
    expect(isCanonicalEngagementType('offsite_review')).toBe(true);
  });

  it('OSUI-03 classifies offsite work by engagement mode, never by wording', () => {
    expect(engagementMode('OFFSITE_REVIEW')).toBe('OFFSITE');
    expect(isOffsiteEngagement('OFFSITE_REVIEW')).toBe(true);
    expect(isOffsiteEngagement('FULL_SCOPE_ONSITE')).toBe(false);
    expect(isOffsiteEngagement('TARGETED_ONSITE')).toBe(false);
    expect(engagementLabel('OFFSITE_REVIEW')).toBe('Offsite review');
    expect(engagementLabel(null)).toBe('—');
    // an unknown server value is shown, not silently relabelled
    expect(engagementLabel('SOME_NEW_TYPE')).toBe('SOME_NEW_TYPE');
  });
});

describe('OSUI-04 — offsite wording is presentation only', () => {
  it('OSUI-04 never tells an offsite review to do fieldwork', () => {
    expect(examinationWorkTerm('OFFSITE_REVIEW')).toBe('offsite review work');
    expect(examinationWorkLabel('OFFSITE_REVIEW')).toBe('Review period');
    expect(examinationWorkTerm('TARGETED_ONSITE')).toBe('fieldwork');
    expect(examinationWorkLabel('TARGETED_ONSITE')).toBe('Fieldwork');
  });

  it('OSUI-05 rewrites onsite phrasing for offsite engagements only', () => {
    const text = 'The scope must be approved before fieldwork can begin at the on-site visit.';
    expect(engagementPhrasing(text, 'OFFSITE_REVIEW')).toContain('offsite review work');
    expect(engagementPhrasing(text, 'OFFSITE_REVIEW')).not.toMatch(/on-?site/i);
    expect(engagementPhrasing(text, 'FULL_SCOPE_ONSITE')).toBe(text);
    expect(engagementPhrasing(text, null)).toBe(text);
  });
});

describe('OSUI-06 — execution kind decides what an intervention becomes', () => {
  it('OSUI-06 executes an offsite review as an examination with the offsite engagement', () => {
    const c = interventionExecutionContract('OFFSITE_REVIEW');
    expect(c.executionKind).toBe('EXAMINATION');
    expect(c.allowedEngagementTypes).toEqual(['OFFSITE_REVIEW']);
    expect(c.defaultEngagementType).toBe('OFFSITE_REVIEW');
    expect(c.requiresExplicitEngagement).toBe(false);
    expect(isExaminationBackedIntervention('OFFSITE_REVIEW')).toBe(true);
  });

  it('OSUI-07 never guesses the engagement for ambiguous onsite work', () => {
    const c = interventionExecutionContract('ONSITE_EXAMINATION');
    expect(c.requiresExplicitEngagement).toBe(true);
    expect(c.defaultEngagementType).toBeNull();
    expect(c.allowedEngagementTypes.length).toBeGreaterThan(1);
  });

  it('OSUI-08 keeps desk review outside the examination engine', () => {
    const c = interventionExecutionContract('DESK_REVIEW');
    expect(c.executionKind).toBe('LIGHTWEIGHT');
    expect(c.allowedEngagementTypes).toEqual([]);
    expect(isExaminationBackedIntervention('DESK_REVIEW')).toBe(false);
    expect(lightweightExecutionGuidance('DESK_REVIEW')).toMatch(/not a formal examination/i);
  });

  it('OSUI-09 explains investigations and referrals rather than offering an examination', () => {
    expect(interventionExecutionContract('FORMAL_INVESTIGATION').executionKind).toBe('INVESTIGATION');
    expect(lightweightExecutionGuidance('FORMAL_INVESTIGATION')).toMatch(/investigation/i);
    expect(interventionExecutionContract('ENFORCEMENT_REFERRAL').executionKind).toBe('REFERRAL');
    expect(lightweightExecutionGuidance('ENFORCEMENT_REFERRAL')).toMatch(/referral/i);
    expect(lightweightExecutionGuidance('OFFSITE_REVIEW')).toBeNull();
  });
});

describe('OSUI-10 — the server, not the browser, decides what may be done', () => {
  it('OSUI-10 reads capability and vocabulary from governed server operations only', () => {
    expect(contractHook).toContain('supervisory_intervention_execution_capabilities');
    expect(contractHook).toContain('supervisory_engagement_types');
    expect(contractHook).not.toMatch(/sec_user_roles|sec_role_permissions|role\s*===/);
  });

  it('OSUI-11 blocks the examination dialog when the server refuses or has not answered', () => {
    expect(activity).toContain(
      'blocked={examCapabilities.isLoading || !examCapabilities.data?.can_open_examination}',
    );
    expect(activity).toContain('block_reason');
    expect(actionDialog).toContain('disabled={busy || pending || blocked}');
  });

  it('OSUI-12 sends only canonical engagement values to the server', () => {
    expect(activity).toContain('engagementType: v.engagement_type');
    expect(activity).toContain('CANONICAL_ENGAGEMENT_TYPES.filter');
    expect(activity).not.toMatch(/engagement_type:\s*'(targeted|full_scope|follow_up|thematic)'/);
    expect(examHook).toContain('CANONICAL_ENGAGEMENT_TYPES');
    expect(examList).not.toMatch(/examination_type:\s*'(targeted|full_scope|follow_up|thematic)'/);
  });
});

describe('OSUI-13 — one object, many views', () => {
  it('OSUI-13 has no offsite-specific workspace, page, route or panel', () => {
    expect(existsSync('src/pages/prudential/OffsiteReviewWorkspace.tsx')).toBe(false);
    const offsiteComponents = panels.filter((f) => /offsite|desk_?review/i.test(f));
    expect(offsiteComponents).toEqual([]);
    expect(routes).not.toMatch(/Offsite\w*Workspace|offsite-review/i);
    expect(routes).toContain('ExaminationWorkspace');
  });

  it('OSUI-14 makes the shared panels engagement-aware instead of forking them', () => {
    const aware = panels.filter((f) =>
      readFileSync(`${PANEL_DIR}/${f}`, 'utf8').includes('engagementPhrasing'),
    );
    // the panels that use onsite language must all rewrite it for offsite work
    ['TeamPanel.tsx', 'ScopingMemoPanel.tsx', 'DataRequestsPanel.tsx', 'FindingsPanel.tsx', 'ExitMeetingPanel.tsx'].forEach(
      (f) => expect(aware).toContain(f),
    );
  });

  it('OSUI-15 derives the engagement from the same canonical examination record', () => {
    expect(engagementHook).toContain("from '@/hooks/useExaminations'");
    expect(engagementHook).toContain('engagement_type');
    expect(engagementHook).not.toMatch(/from\('examinations'\)|\.rpc\(/);
  });
});
