import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const sql = fs.readdirSync(path.join(root, 'supabase/migrations')).map((f) => read(`supabase/migrations/${f}`)).join('\n');

describe('AML-CLOSE-06 lifecycle case integrity (source guarantees)', () => {
  it('editing and submission require the current case owner', () => {
    expect(sql).toMatch(/FUNCTION public\.supervisory_assessment_case_actor_require/);
    expect(sql).toMatch(/not_case_owner/);
    for (const f of ['execution_require_edit', 'question_upsert', 'calculate', 'dimension_upsert', 'submit_for_review']) {
      expect(sql).toContain(`'supervisory_assessment_${f}'`);
    }
  });

  it('assignment history is append-only and governed', () => {
    expect(sql).toMatch(/CREATE TABLE public\.supervisory_assessment_assignment/);
    expect(sql).toMatch(/supervisory_assessment_assignment is append-only/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*supervisory_assessment_assignment TO authenticated/);
  });

  it('reassignment needs supervisory authority, reason and expected current holder', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.supervisory_assessment_reassign('));
    const body = fn.slice(0, fn.indexOf('END $$'));
    expect(body).toMatch(/supervisory_assessment_can_reassign/);
    expect(body).toMatch(/at least 10 characters/);
    expect(body).toMatch(/stale_assignment/);
    expect(body).toMatch(/cannot review the assessment/);
  });

  it('the screen renders reassignment only from server actions', () => {
    const card = read('src/components/supervision/aml/AmlAssessmentAssignmentCard.tsx');
    expect(card).toMatch(/actionOf\(life, 'REASSIGN_OWNER'\)/);
    expect(card).toMatch(/actionOf\(life, 'ASSIGN_REVIEWER'\)/);
    expect(card).toMatch(/expectedCurrentId: current/);
  });
});
