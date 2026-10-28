import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { reportStatusCounts } from '@/lib/reportStatusCounts';
import { examinationTypeReadValues, engagementLabel, isCanonicalEngagementType } from '@/lib/supervisoryEngagement';
import { DataTableShell } from '@/components/shared/DataTableShell';
import { formatRecordMoney, formatTotalsByCurrency, primeConfiguredCurrencies, resetConfiguredCurrencies } from '@/lib/money';

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => <select aria-label="Rows per page" value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null, SelectValue: () => null,
}));

afterEach(() => { cleanup(); resetConfiguredCurrencies(); });

describe('monitoring report reconciliation', () => {
  it('includes submitted complaints rather than a fictional received status', () => {
    expect(reportStatusCounts([{ status: 'submitted' }, { status: 'closed' }])).toEqual({
      total: 2, rows: [{ status: 'closed', count: 1 }, { status: 'submitted', count: 1 }],
    });
  });
  it('accounts for every finding and application state, including unknown and null states', () => {
    const states = ['draft','under_analysis','awaiting_entity_response','response_received','confirmed','dismissed','remediation_required','closed','under_review','query_raised','resubmission_requested','future_state',null];
    const result = reportStatusCounts(states.map(status => ({ status })));
    expect(result.total).toBe(13);
    expect(result.rows.reduce((sum, r) => sum + r.count, 0)).toBe(13);
    expect(result.rows.find(r => r.status === 'future_state')?.count).toBe(1);
  });
});

describe('historical examination read compatibility', () => {
  it('matches both canonical and legacy full-scope and targeted rows', () => {
    expect(examinationTypeReadValues('FULL_SCOPE_ONSITE')).toEqual(['FULL_SCOPE_ONSITE','full_scope']);
    expect(examinationTypeReadValues('TARGETED_ONSITE')).toEqual(['TARGETED_ONSITE','targeted']);
    expect(engagementLabel('full_scope')).toBe('Full-scope onsite examination');
    expect(engagementLabel('targeted')).toBe('Targeted onsite examination');
    expect(isCanonicalEngagementType('targeted')).toBe(false);
  });
});

describe('custom page sizes', () => {
  it('starts at 15, changes to 50, and keeps the selector available on one page', () => {
    const data = Array.from({ length: 40 }, (_, i) => ({ id: String(i), label: `Row ${i}` }));
    render(<DataTableShell columns={[{ key: 'label', label: 'Label' }]} data={data} pageSize={15} />);
    expect(screen.getAllByRole('row')).toHaveLength(16);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('15');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });
    expect(screen.getAllByRole('row')).toHaveLength(41);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('50');
  });
});

describe('billing raw amounts in configured currency', () => {
  it('uses the configured base currency for currency-less fee components and numeric totals', () => {
    primeConfiguredCurrencies({ baseCurrency: 'XCD' });
    expect(formatRecordMoney(1500)).toContain('1,500.00');
    expect(formatTotalsByCurrency([{ amount: 1500 }, { amount: 250.5 }])).toContain('1,750.50');
    expect(formatTotalsByCurrency([{ amount: 0 }])).toContain('0.00');
  });
});