import { describe, expect, it } from 'vitest';
import {
  automatedOutcomeSentence,
  determinationBlockReasons,
  findingDescription,
  findingLabel,
  findingTone,
  sufficiencyDecisionLabel,
  sufficiencyStatusLabel,
} from '@/lib/licensing/sufficiencyLabels';

describe('sufficiency labels', () => {
  it('maps statuses to business wording', () => {
    expect(sufficiencyStatusLabel('pass')).toBe('Passed');
    expect(sufficiencyStatusLabel('warning')).toBe('Needs attention');
    expect(sufficiencyStatusLabel('fail')).toBe('Not satisfied');
    expect(sufficiencyStatusLabel('custom_state')).toBe('Custom state');
  });

  it('escalates blocking failures', () => {
    expect(findingLabel('fail', 'blocker')).toBe('Blocking issue');
    expect(findingLabel('fail', 'warning')).toBe('Not satisfied');
    expect(findingTone('fail', 'blocker')).toBe('negative');
    expect(findingTone('pass', 'info')).toBe('positive');
  });

  it('describes the automated outcome from real counts', () => {
    expect(automatedOutcomeSentence({ passed: 10, warnings: 0, blockers: 0 }))
      .toContain('No blocking issues were identified');
    expect(automatedOutcomeSentence({ passed: 10, warnings: 2, blockers: 0 }))
      .toContain('2 items require reviewer attention');
    expect(automatedOutcomeSentence({ passed: 10, warnings: 2, blockers: 1 }))
      .toContain('1 blocking issue must be resolved');
  });

  it('never exposes raw JSON in descriptions', () => {
    expect(findingDescription({ message: 'Financials missing' })).toBe('Financials missing');
    expect(findingDescription({ foo: 'bar' }, 'Ownership')).toBe('Automated check: Ownership.');
  });

  it('translates server gate rejections', () => {
    expect(determinationBlockReasons({ unresolved_blocker_count: 1, open_rfi_count: 2 }))
      .toEqual(['1 blocking sufficiency issue', '2 open information requests']);
    expect(determinationBlockReasons({})).toEqual([]);
  });

  it('labels decisions', () => {
    expect(sufficiencyDecisionLabel('sufficient')).toBe('Sufficient');
    expect(sufficiencyDecisionLabel('deferred')).toBe('Deferred');
  });
});
