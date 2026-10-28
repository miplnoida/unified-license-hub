import { describe, it, expect } from 'vitest';
import { decorate, buildReportSummary, REPORT_SLUG_SOURCE_MAP } from '../../supabase/functions/_shared/report-generator';
import { REPORT_DEFINITIONS } from '@/pages/reports/reportDefinitions';

describe('supervisory reports', () => {
  it('outstanding penalty = assessed - paid - waived, never negative', () => {
    const rows = decorate('sup-enf-sanctions', [
      { penalty_amount: 10000, penalty_paid_amount: 2500, penalty_waived_amount: 1500 },
      { penalty_amount: 1000, penalty_paid_amount: 1200, penalty_waived_amount: 0 },
    ]);
    expect(rows[0].penalty_outstanding).toBe(6000);
    expect(rows[1].penalty_outstanding).toBe(0);
    expect(buildReportSummary('sup-enf-sanctions', rows).penalty_outstanding_total).toBe(6000);
  });

  it('open finding past target date is overdue; closed finding is not', () => {
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const rows = decorate('sup-exam-findings', [
      { status: 'open', target_date: past },
      { status: 'closed', target_date: past, closed_at: new Date().toISOString() },
    ]);
    expect(rows[0].remediation_state).toBe('overdue');
    expect(rows[1].remediation_state).toBe('closed');
  });

  it('every new definition maps to the server source', () => {
    for (const id of ['sup-approved-persons', 'sup-exam-programme', 'sup-exam-findings', 'sup-enf-sanctions']) {
      const def = REPORT_DEFINITIONS.find((d) => d.id === id);
      expect(def?.source).toBe(REPORT_SLUG_SOURCE_MAP[id]);
    }
  });
});
