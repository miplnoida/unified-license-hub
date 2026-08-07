import { describe, it, expect } from 'vitest';
import {
  deriveRatioResultState,
  readPeerState,
  peerPercentileOf,
  ewiDedupKey,
  isAssessmentFinal,
  isAssessmentEditable,
  deriveGroupDataState,
} from '@/lib/prudentialPhase2';

describe('ratio result states (PRU-ANA-001 §3.3)', () => {
  it('marks a computed value as CALCULATED', () => {
    expect(deriveRatioResultState(0.15, null)).toBe('CALCULATED');
  });
  it('never turns a zero value into a missing state', () => {
    expect(deriveRatioResultState(0, null)).toBe('CALCULATED');
  });
  it('reports missing inputs as INSUFFICIENT_DATA', () => {
    expect(deriveRatioResultState(null, 'missing_input')).toBe('INSUFFICIENT_DATA');
    expect(deriveRatioResultState(null, 'missing_ratio_dependency')).toBe('INSUFFICIENT_DATA');
  });
  it('reports absent configuration as NOT_CONFIGURED', () => {
    expect(deriveRatioResultState(null, 'not_configured')).toBe('NOT_CONFIGURED');
  });
  it('reports division by zero as CALCULATION_ERROR, not 0', () => {
    expect(deriveRatioResultState(null, 'division_by_zero')).toBe('CALCULATION_ERROR');
  });
  it('falls back to INSUFFICIENT_DATA when nothing is known', () => {
    expect(deriveRatioResultState(null, null)).toBe('INSUFFICIENT_DATA');
  });
});

describe('peer comparison gating (PRU-ANA-001 §3.6)', () => {
  it('honours an explicit insufficient-sample state', () => {
    expect(readPeerState({ state: 'INSUFFICIENT_PEER_DATA', peer_count: 2, min_peers: 5 }))
      .toBe('INSUFFICIENT_PEER_DATA');
  });
  it('treats a stateless or empty snapshot as unavailable', () => {
    expect(readPeerState(null)).toBe('UNAVAILABLE');
    expect(readPeerState({ median: 3 })).toBe('UNAVAILABLE');
  });
  it('accepts an OK snapshot', () => {
    expect(readPeerState({ state: 'OK', peer_count: 7 })).toBe('OK');
  });
  it('computes percentile only from a usable sample', () => {
    expect(peerPercentileOf(50, [10, 20, 30, 40, 50, 60, 70]))
      .toBe(Math.round((4 / 7) * 10000) / 100);
    expect(peerPercentileOf(50, [])).toBeNull();
    expect(peerPercentileOf(null, [1, 2, 3])).toBeNull();
  });
});

describe('EWI dedup key (PRU-ANA-001 §3.7)', () => {
  it('is stable for the same entity/rule/period/metric', () => {
    const a = { entity_id: 'e1', rule_id: 'r1', period_end: '2025-03-31', metric_key: 'car' };
    expect(ewiDedupKey(a)).toBe(ewiDedupKey({ ...a }));
  });
  it('differs when the metric or period differs', () => {
    const base = { entity_id: 'e1', rule_id: 'r1', period_end: '2025-03-31', metric_key: 'car' };
    expect(ewiDedupKey({ ...base, metric_key: 'lcr' })).not.toBe(ewiDedupKey(base));
    expect(ewiDedupKey({ ...base, period_end: '2025-06-30' })).not.toBe(ewiDedupKey(base));
  });
  it('normalises absent period and metric', () => {
    expect(ewiDedupKey({ entity_id: 'e1', rule_id: 'r1' })).toBe('e1|r1||');
  });
});

describe('assessment immutability (PRU-ASS-001 §4.4)', () => {
  it('locks approved and closed assessments', () => {
    expect(isAssessmentFinal('approved')).toBe(true);
    expect(isAssessmentFinal('closed')).toBe(true);
    expect(isAssessmentEditable('approved')).toBe(false);
  });
  it('allows editing while drafting or after a return for revision', () => {
    expect(isAssessmentEditable('draft')).toBe(true);
    expect(isAssessmentEditable('returned_for_revision')).toBe(true);
    expect(isAssessmentFinal('returned_for_revision')).toBe(false);
  });
});

describe('group data coverage (PRU-GRP-001 §5.5)', () => {
  it('reports complete coverage only when every member reported', () => {
    expect(deriveGroupDataState(4, 0)).toBe('COMPLETE_GROUP_DATA');
  });
  it('never hides a missing subsidiary behind a complete-looking result', () => {
    expect(deriveGroupDataState(4, 1)).toBe('PARTIAL_GROUP_DATA');
  });
  it('reports no group data when nobody reported or the group is empty', () => {
    expect(deriveGroupDataState(3, 3)).toBe('NO_GROUP_DATA');
    expect(deriveGroupDataState(0, 0)).toBe('NO_GROUP_DATA');
  });
});
