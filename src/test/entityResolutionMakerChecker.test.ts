/**
 * Entity Resolution maker-checker guardrails.
 *
 * The runtime lifecycle is certified against the database (officer
 * recommendation → escalation → supervisor approval/return, self-approval
 * refusal, registration binding integrity, membership separation). These tests
 * lock the client contract so the governed surface cannot silently regress:
 *  - the frontend reads resolution work only through the governed read models;
 *  - the case workspace exposes the supervisory actions;
 *  - no client-side table access to resolution tables is reintroduced.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const service = read('src/services/entityRegistry.ts');
const hooks = read('src/hooks/useEntityRegistry.ts');
const detail = read('src/pages/licensing/EntityResolutionDetail.tsx');
const queue = read('src/pages/licensing/EntityResolutionQueue.tsx');
const oversight = read('src/pages/licensing/OnboardingWorkspace.tsx');

describe('entity resolution — governed read models', () => {
  it('reads the queue and case through governed RPCs', () => {
    expect(service).toContain("call<{ rows: ResolutionQueueRow[]; awaiting_supervisor_count: number }>('entity_resolution_queue'");
    expect(service).toContain("'entity_resolution_case_view'");
    expect(hooks).toContain('registry.getResolutionQueue');
    expect(hooks).toContain('registry.getResolutionCaseView');
  });

  it('no longer queries resolution tables from the browser', () => {
    for (const source of [hooks, detail, queue]) {
      expect(source).not.toContain("from('entity_resolution_cases')");
      expect(source).not.toContain("from('entity_match_candidates')");
      expect(source).not.toContain("from('entity_resolution_events')");
    }
  });
});

describe('entity resolution — maker-checker actions', () => {
  it('declares recommendation and supervisory actions', () => {
    for (const action of [
      'RECOMMEND_EXISTING', 'RECOMMEND_NEW', 'RESOLVE_EXISTING', 'CONFIRM_NEW',
      'REQUEST_EVIDENCE', 'ESCALATE', 'APPROVE', 'RETURN_FOR_REVIEW',
    ]) {
      expect(service).toContain(`'${action}'`);
    }
  });

  it('separates the officer recommendation from the supervisor decision', () => {
    expect(detail).toContain('Officer recommendation');
    expect(detail).toContain('Supervisor decision');
    expect(detail).toContain("run('APPROVE'");
    expect(detail).toContain("run('RETURN_FOR_REVIEW'");
    expect(detail).toContain("run('REQUEST_EVIDENCE'");
    expect(detail).toContain("'RECOMMEND_EXISTING'");
    expect(detail).toContain("'RECOMMEND_NEW'");

  });

  it('gates supervisory actions on entity_resolution.approve', () => {
    expect(detail).toContain("useCan('entity_resolution', 'approve')");
    expect(detail).toMatch(/canApprove &&/);
  });

  it('only offers a supervisory decision on an escalated case', () => {
    expect(detail).toContain("const isEscalated = detail?.status === 'ESCALATED'");
    expect(detail).toContain('{isEscalated && (');
  });

  it('respects the server maker-checker policy flag', () => {
    expect(detail).toContain('requires_maker_checker');
    expect(detail).toContain("makerChecker ? 'RECOMMEND_EXISTING' : 'RESOLVE_EXISTING'");
    expect(detail).toContain("makerChecker ? 'RECOMMEND_NEW' : 'CONFIRM_NEW'");
  });

  it('requires a durable rationale on every decision', () => {
    expect(detail).toContain('rationale.trim().length < 10');
  });

  it('states that identity resolution does not grant portal authority', () => {
    expect(detail).toContain('does not grant portal authority');
  });
});

describe('entity resolution — supervisory queue', () => {
  it('surfaces an awaiting-supervisor view with a count badge', () => {
    expect(queue).toContain("value: 'ESCALATED', label: 'Awaiting supervisor decision'");
    expect(queue).toContain('awaiting_supervisor_count');
  });

  it('shows recommendation context on escalated rows', () => {
    for (const column of [
      'Recommendation', 'Recommended organisation', 'Recommending officer', 'Escalated by', 'Escalation age',
    ]) {
      expect(queue).toContain(column);
    }
  });

  it('uses business-friendly terminology instead of raw codes', () => {
    expect(queue).toContain("POSSIBLE_MATCH: 'Possible match'");
    expect(queue).toContain("RESOLVED: 'Resolution complete'");
  });
});

describe('onboarding oversight linkage', () => {
  it('links identification activity to the canonical resolution case', () => {
    expect(oversight).toContain('/licensing/entity-resolution/${r.resolution_case_id}');
  });
});
