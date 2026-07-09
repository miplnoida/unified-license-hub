import { describe, it, expect } from 'vitest';
import { evaluateAccountingReconciliation } from '@/lib/returnsAccountingReconciliation';

const forms = [
  { formId: 'bs', templateName: 'Balance Sheet' },
  { formId: 'pl', templateName: 'P&L' },
];

const buildData = (bsOverride: Record<string, string> = {}, plOverride: Record<string, string> = {}) => ({
  bs: {
    line_1_col_1: '1000', // total assets
    line_2_col_1: '700',  // total liabilities
    line_3_col_1: '300',  // total equity
    ...bsOverride,
  },
  pl: {
    line_4_col_1: '500',   // total income
    line_5_col_1: '400',   // total expenses
    line_10_col_1: '100',  // pre-tax profit
    ...plOverride,
  },
});

describe('evaluateAccountingReconciliation', () => {
  it('passes when both statements reconcile', () => {
    const r = evaluateAccountingReconciliation(buildData(), forms);
    expect(r.passed).toBe(true);
    expect(r.checks.find((c) => c.key === 'bs_balance')?.ok).toBe(true);
    expect(r.checks.find((c) => c.key === 'pnl_reconcile')?.ok).toBe(true);
  });

  it('blocks when balance sheet does not balance', () => {
    const r = evaluateAccountingReconciliation(buildData({ line_3_col_1: '250' }), forms);
    expect(r.passed).toBe(false);
    const c = r.checks.find((c) => c.key === 'bs_balance')!;
    expect(c.ok).toBe(false);
    expect(c.diff).toBe(50);
  });

  it('blocks when P&L does not reconcile', () => {
    const r = evaluateAccountingReconciliation(buildData({}, { line_10_col_1: '90' }), forms);
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.key === 'pnl_reconcile')?.ok).toBe(false);
  });

  it('produces the summary rows for the preview panel', () => {
    const r = evaluateAccountingReconciliation(buildData(), forms);
    const labels = r.summary.map((s) => s.label);
    expect(labels).toContain('Total Assets');
    expect(labels).toContain('Pre-tax Profits');
    expect(labels).toContain('Prescribed Liabilities');
  });

  it('skips checks when required forms are missing', () => {
    const r = evaluateAccountingReconciliation({ bs: { line_1_col_1: '1000' } }, [forms[0]]);
    expect(r.checks.find((c) => c.key === 'pnl_reconcile')?.skipped).toBe(true);
  });

  it('blocks when form is present but total fields are empty', () => {
    const data = { bs: { line_1_col_1: '1000' }, pl: {} };
    const r = evaluateAccountingReconciliation(data, forms);
    expect(r.passed).toBe(false);
    const bs = r.checks.find((c) => c.key === 'bs_balance')!;
    expect(bs.skipped).toBe(false);
    expect(bs.ok).toBe(false);
    const pl = r.checks.find((c) => c.key === 'pnl_reconcile')!;
    expect(pl.skipped).toBe(false);
    expect(pl.ok).toBe(false);
  });
});
