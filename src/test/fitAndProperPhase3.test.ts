import { describe, it, expect } from 'vitest';
import {
  FP_PROVIDER_STATE_META,
  normalizeProviderState,
  isConclusive,
  type FpProviderState,
} from '@/lib/fp/providerStates';
import { classifyChange, FP_CHANGE_META } from '@/lib/fp/comparison';

/**
 * Phase 3 — the client derivation helpers must share one vocabulary with the
 * database (`fp_normalise_provider_state` / `fp_provider_state_conclusive`).
 * These tokens are asserted verbatim so client and SQL cannot drift apart.
 */
const SQL_STATES: FpProviderState[] = [
  'SUCCESS_HIT',
  'SUCCESS_NO_MATCH',
  'NOT_CONFIGURED',
  'SANDBOX',
  'PROVIDER_FAILURE',
  'TRANSPORT_FAILURE',
  'RATE_LIMITED',
  'MANUAL',
];

const SQL_CONCLUSIVE: FpProviderState[] = ['SUCCESS_HIT', 'SUCCESS_NO_MATCH', 'MANUAL'];

describe('fp provider state vocabulary', () => {
  it('matches the SQL vocabulary token-for-token', () => {
    expect(Object.keys(FP_PROVIDER_STATE_META).sort()).toEqual([...SQL_STATES].sort());
  });

  it('agrees with SQL on which states are conclusive', () => {
    const clientConclusive = SQL_STATES.filter((s) => isConclusive(s)).sort();
    expect(clientConclusive).toEqual([...SQL_CONCLUSIVE].sort());
  });

  it('never derives a clean result from a non-completing provider', () => {
    for (const raw of [
      'not_configured',
      'unconfigured',
      'sandbox',
      'failed',
      'failure',
      'provider_error',
      'timeout',
      'network_error',
      'transport_error',
      'rate_limited',
      'throttled',
      '',
      'total_nonsense',
    ]) {
      expect(normalizeProviderState(raw)).not.toBe('SUCCESS_NO_MATCH');
      expect(normalizeProviderState(raw)).not.toBe('SUCCESS_HIT');
    }
  });

  it('maps the legacy outcomes onto the canonical states', () => {
    expect(normalizeProviderState('screened_clean')).toBe('SUCCESS_NO_MATCH');
    expect(normalizeProviderState('screened_hits')).toBe('SUCCESS_HIT');
    expect(normalizeProviderState('clean')).toBe('SUCCESS_NO_MATCH');
    expect(normalizeProviderState('hit')).toBe('SUCCESS_HIT');
    expect(normalizeProviderState('match')).toBe('SUCCESS_HIT');
    expect(normalizeProviderState('manual')).toBe('MANUAL');
    expect(normalizeProviderState('SANDBOX')).toBe('SANDBOX');
  });

  it('fails closed for an unrecognised outcome', () => {
    expect(normalizeProviderState('who_knows')).toBe('PROVIDER_FAILURE');
    expect(isConclusive(normalizeProviderState('who_knows'))).toBe(false);
  });

  it('labels every non-conclusive state without implying a clean subject', () => {
    for (const state of SQL_STATES) {
      const meta = FP_PROVIDER_STATE_META[state];
      if (!meta.conclusive) {
        expect(meta.label.toLowerCase()).not.toContain('no adverse');
        expect(meta.label.toLowerCase()).not.toContain('clean');
      }
    }
  });
});

describe('fp assessment comparison classes', () => {
  it('mirrors the SQL classification', () => {
    expect(classifyChange({ severity: 'low' }, null)).toBe('new');
    expect(classifyChange(null, { severity: 'low' })).toBe('resolved');
    expect(classifyChange({ severity: 'high' }, { severity: 'low' })).toBe('worsened');
    expect(classifyChange({ severity: 'low' }, { severity: 'medium' })).toBe('changed');
    expect(classifyChange({ severity: 'low' }, { severity: 'low' })).toBe('unchanged');
  });

  it('exposes a label for every class the RPC can return', () => {
    for (const key of ['new', 'changed', 'unchanged', 'resolved', 'worsened'] as const) {
      expect(FP_CHANGE_META[key]?.label).toBeTruthy();
    }
  });
});
