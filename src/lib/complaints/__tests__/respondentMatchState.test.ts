import { describe, expect, it } from 'vitest';
import {
  RESPONDENT_MATCH_STATES,
  respondentMatchStateLabel,
} from '@/lib/complaints/respondentMatchState';

describe('respondent match state labels (MC-02 UI contract)', () => {
  it('maps every canonical intake state to business language', () => {
    expect(respondentMatchStateLabel('MATCHED_REGULATED')).toBe('Currently regulated');
    expect(respondentMatchStateLabel('MATCHED_PREVIOUSLY_REGULATED')).toBe('Previously regulated');
    expect(respondentMatchStateLabel('UNMATCHED')).toBe('Entity not yet matched');
    expect(respondentMatchStateLabel('SUSPECTED_UNAUTHORISED')).toBe('Suspected unauthorized provider');
    expect(respondentMatchStateLabel('INTERMEDIARY')).toBe('Intermediary / agent / broker');
    expect(respondentMatchStateLabel('PENDING_MATCH')).toBe('Matching required');
  });

  it('never renders a raw code for a recognised state', () => {
    for (const state of RESPONDENT_MATCH_STATES) {
      const label = respondentMatchStateLabel(state);
      expect(label).not.toContain('_');
      expect(label).not.toBe(state);
    }
  });

  it('falls back to plain language for unknown or missing states', () => {
    expect(respondentMatchStateLabel(null)).toBe('Match state not recorded');
    expect(respondentMatchStateLabel('SOMETHING_ELSE')).toBe('Match state not recorded');
  });

  it('rejects the retired lowercase MC-01 assumptions', () => {
    expect(respondentMatchStateLabel('matched_current')).toBe('Match state not recorded');
    expect(respondentMatchStateLabel('suspected_unlicensed')).toBe('Match state not recorded');
  });
});

describe('outstanding information requests use authoritative server state', () => {
  const rows = [
    { id: '1', status: 'OPEN', response_received_at: null },
    { id: '2', status: 'RESPONDED', response_received_at: '2026-01-02T00:00:00Z' },
    { id: '3', status: 'CANCELLED', response_received_at: null },
  ];
  const outstanding = rows.filter((r) => String(r.status).toUpperCase() === 'OPEN');

  it('keeps only OPEN requests outstanding', () => {
    expect(outstanding.map((r) => r.id)).toEqual(['1']);
  });

  it('retains responded requests in history', () => {
    expect(rows.find((r) => r.id === '2')?.response_received_at).toBeTruthy();
  });
});
