import { describe, expect, it } from 'vitest';
import { calcPolicyErrorMessage } from '@/hooks/useAmlCalculationPolicy';

const msg = (raw: string) => calcPolicyErrorMessage(new Error(raw));

describe('governed judgement refusal messages (AML-CLOSE-05A)', () => {
  it('explains each judgement-policy refusal in plain language', () => {
    expect(msg('judgement_policy_movement_refused: rule X')).toMatch(/that many steps/);
    expect(msg('judgement_policy_direction_refused: rule X')).toMatch(/in that direction/);
    expect(msg('judgement_policy_target_prohibited: x')).toMatch(/never allows that rating/);
    expect(msg('judgement_policy_forbids_override: x')).toMatch(/does not allow an override/);
    expect(msg('judgement_policy_no_rule: x')).toMatch(/no rule/);
    expect(msg('judgement_policy_unavailable: x')).toMatch(/cannot be read/);
    expect(msg('rationale_required: an override needs a written supervisory reason')).toMatch(/longer written rationale/);
  });

  it('keeps platform invariants distinct from policy refusals', () => {
    expect(msg('maker_checker: x')).toMatch(/someone other than the person who proposed/);
    expect(msg('already_decided: stale_override')).toMatch(/recalculated/);
    expect(msg('assessment_locked: a draft only')).toMatch(/recalculated/);
    expect(msg('not_calculated: x')).toMatch(/no calculated result/i);
  });
});
