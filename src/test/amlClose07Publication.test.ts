import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const files = fs.readdirSync(path.join(root, 'supabase/migrations')).sort();
const sql = files.map((f) => read(`supabase/migrations/${f}`)).join('\n');
const last = (name: string) => {
  const i = sql.lastIndexOf(`OR REPLACE FUNCTION public.${name}(`);
  const body = sql.slice(i);
  return body.slice(0, body.indexOf('END $function$'));
};

describe('AML-CLOSE-07 publication and risk-of-record (source guarantees)', () => {
  it('approval does not make an assessment current; only publication does', () => {
    const approve = last('supervisory_assessment_approve');
    expect(approve).not.toMatch(/is_current\s*=\s*true/);
    expect(approve).toMatch(/effective_date_refused/);
    const pub = last('supervisory_assessment_publish_internal');
    expect(pub).toMatch(/is_current = true/);
  });

  it('publication is stale-guarded, independent, idempotent and never recalculates', () => {
    const pub = last('supervisory_assessment_publish_internal');
    expect(pub).toMatch(/stale_publication/);
    expect(pub).toMatch(/cannot publish it/);
    expect(pub).toMatch(/already_published', true/);
    expect(pub).toMatch(/pg_advisory_xact_lock/);
    expect(pub).not.toMatch(/supervisory_assessment_calculate|supervisory_calc_/);
    expect(pub).toMatch(/_d\.final_rating/);
  });

  it('a canonical as-of resolver derives from publications only', () => {
    const asOf = last('supervisory_entity_risk_as_of');
    expect(asOf).toMatch(/supervisory_assessment_risk_publication/);
    expect(asOf).toMatch(/LEGACY_RISK_STATE/);
    expect(asOf).not.toMatch(/residual_rating FROM public\.supervisory_assessment/);
  });

  it('official-risk tables are not client-writable', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public\.supervisory_assessment_risk_publication/);
  });

  it('the review screen can approve without publishing', () => {
    const panel = read('src/components/supervision/aml/AmlAssessmentReviewPanel.tsx');
    expect(panel).toMatch(/publish: publishOnApprove/);
  });

  it('AML-CLOSE-07A: one eligibility authority drives both the action contract and the publish command', () => {
    const ev = last('supervisory_assessment_publication_eligibility_internal');
    for (const code of ['OK', 'STATE_NOT_ELIGIBLE', 'PERMISSION_MISSING', 'MAKER_CHECKER', 'STALE_PUBLICATION', 'ALREADY_PUBLISHED', 'EFFECTIVE_DATE_REFUSED', 'NO_APPROVAL_DECISION']) {
      expect(ev).toContain(`'${code}'`);
    }
    expect(last('supervisory_assessment_lifecycle_state')).toMatch(/'permitted', \(_pe->>'reason_code'\) = 'OK'/);
    expect(last('supervisory_assessment_publish_internal')).toMatch(/supervisory_assessment_publication_eligibility_internal\(_assessment_id, _uid\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.supervisory_assessment_publication_eligibility_internal\(uuid, uuid\) FROM PUBLIC, anon, authenticated/);
  });

  it('AML-CLOSE-07A: movement trend follows canonical rating order; same rating stays STABLE', () => {
    const pub = last('supervisory_assessment_publish_internal');
    expect(pub).toMatch(/upper\(_d\.final_rating\)\) THEN 'STABLE'|upper\(_prev\.residual_rating\) = upper\(_d\.final_rating\) THEN 'STABLE'/);
    expect(pub).toMatch(/sup_risk_ordinal\(_d\.final_rating\) < public\.sup_risk_ordinal\(_prev\.residual_rating\) THEN 'IMPROVING'/);
    expect(pub).toMatch(/sup_risk_ordinal\(_d\.final_rating\) > public\.sup_risk_ordinal\(_prev\.residual_rating\) THEN 'DETERIORATING'/);
  });
});
