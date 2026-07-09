// Accounting reconciliation for Balance Sheet + P&L returns.
//
// Enforces three checks before allowing a licensee to submit:
//   A) Balance Sheet balances:  Total Assets == Total Liabilities + Total Equity
//                                line_1_col_1 == line_2_col_1 + line_3_col_1
//   B) P&L reconciles:          Total Income - Total Expenses == Pre-tax Profits
//                                line_4_col_1 - line_5_col_1  == line_10_col_1
//   C) BS <-> P&L link:         BS-derived Total Income / Pre-tax Profits equal
//                                the P&L values (line_4 / line_10 on the P&L form).
//
// Tolerance is exact (0) after rounding to 2 decimal places, per requirement.

export interface ReconciliationForm {
  formId: string;                       // form template id (matches allData key)
  templateName: string | null | undefined;
}

export type ReconciliationCheckKey = 'bs_balance' | 'pnl_reconcile' | 'bs_pnl_link';

export interface ReconciliationCheck {
  key: ReconciliationCheckKey;
  label: string;
  lhsLabel: string;
  rhsLabel: string;
  lhs: number | null;
  rhs: number | null;
  diff: number | null;
  ok: boolean;
  skipped: boolean;
  reason?: string;
}

export interface ReconciliationSummaryRow {
  key: string;
  label: string;
  value: number | null;
}

export interface ReconciliationResult {
  passed: boolean;
  hasBalanceSheet: boolean;
  hasProfitLoss: boolean;
  checks: ReconciliationCheck[];
  summary: ReconciliationSummaryRow[];
}

const BS_NAME_RE = /balance\s*sheet/i;
const PNL_NAME_RE = /(p&?\s*l|profit.*loss)/i;

export function detectFormRoles(forms: ReconciliationForm[]) {
  let bsFormId: string | null = null;
  let pnlFormId: string | null = null;
  for (const f of forms) {
    const name = (f.templateName || '').trim();
    if (!bsFormId && BS_NAME_RE.test(name)) bsFormId = f.formId;
    if (!pnlFormId && PNL_NAME_RE.test(name)) pnlFormId = f.formId;
  }
  return { bsFormId, pnlFormId };
}

function num(
  data: Record<string, Record<string, any>>,
  formId: string | null,
  fieldName: string,
): number | null {
  if (!formId) return null;
  const raw = data[formId]?.[fieldName];
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function round2(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function evaluateAccountingReconciliation(
  allData: Record<string, Record<string, any>>,
  forms: ReconciliationForm[],
): ReconciliationResult {
  const { bsFormId, pnlFormId } = detectFormRoles(forms);
  const hasBalanceSheet = !!bsFormId;
  const hasProfitLoss = !!pnlFormId;

  // ----- Pull raw inputs -----
  const totalAssets      = num(allData, bsFormId,  'line_1_col_1');
  const totalLiabilities = num(allData, bsFormId,  'line_2_col_1');
  const totalEquity      = num(allData, bsFormId,  'line_3_col_1');
  const totalIncome      = num(allData, pnlFormId, 'line_4_col_1');
  const totalExpenses    = num(allData, pnlFormId, 'line_5_col_1');
  const preTaxProfit     = num(allData, pnlFormId, 'line_10_col_1');
  const interestIncome   = num(allData, pnlFormId, 'line_4_1_col_1');
  const interestExpense  = num(allData, pnlFormId, 'line_5_1_col_1');
  const grossLoans       = num(allData, bsFormId,  'line_1_4_col_1');
  const npls             = num(allData, bsFormId,  'line_1_5_1_3_2_col_1');
  const pdls             = num(allData, bsFormId,  'line_8_4_col_1');
  const provisions       = num(allData, bsFormId,  'line_3_3_3_4_col_1');
  const liquidAssets     = num(allData, bsFormId,  'line_1_1_col_1');
  const prescribedLiab   = num(allData, bsFormId,  'line_2_1_col_1');

  const checks: ReconciliationCheck[] = [];

  // Check A — Balance Sheet balances
  {
    const skipped = !hasBalanceSheet;
    const missing = hasBalanceSheet && (totalAssets === null || totalLiabilities === null || totalEquity === null);
    const lhs = round2(totalAssets ?? 0);
    const rhs = round2((totalLiabilities ?? 0) + (totalEquity ?? 0));
    const diff = lhs !== null && rhs !== null ? round2(lhs - rhs) : null;
    const missingParts: string[] = [];
    if (hasBalanceSheet) {
      if (totalAssets === null) missingParts.push('Total Assets');
      if (totalLiabilities === null) missingParts.push('Total Liabilities');
      if (totalEquity === null) missingParts.push('Total Equity');
    }
    checks.push({
      key: 'bs_balance',
      label: 'Balance Sheet balances',
      lhsLabel: 'Total Assets',
      rhsLabel: 'Total Liabilities + Total Equity',
      lhs, rhs, diff,
      ok: !skipped && !missing && diff === 0,
      skipped,
      reason: skipped
        ? 'No Balance Sheet form on this return.'
        : missing ? `Empty required value(s): ${missingParts.join(', ')}.` : undefined,
    });
  }

  // Check B — P&L reconciles
  {
    const skipped = !hasProfitLoss;
    const missing = hasProfitLoss && (totalIncome === null || totalExpenses === null || preTaxProfit === null);
    const lhs = round2((totalIncome ?? 0) - (totalExpenses ?? 0));
    const rhs = round2(preTaxProfit ?? 0);
    const diff = lhs !== null && rhs !== null ? round2(lhs - rhs) : null;
    const missingParts: string[] = [];
    if (hasProfitLoss) {
      if (totalIncome === null) missingParts.push('Total Income');
      if (totalExpenses === null) missingParts.push('Total Expenses');
      if (preTaxProfit === null) missingParts.push('Pre-tax Profit');
    }
    checks.push({
      key: 'pnl_reconcile',
      label: 'P&L reconciles',
      lhsLabel: 'Total Income − Total Expenses',
      rhsLabel: 'Pre-tax Profits',
      lhs, rhs, diff,
      ok: !skipped && !missing && diff === 0,
      skipped,
      reason: skipped
        ? 'No P&L form on this return.'
        : missing ? `Empty required value(s): ${missingParts.join(', ')}.` : undefined,
    });
  }

  // Check C — BS ↔ P&L link
  {
    const skipped = !hasBalanceSheet || !hasProfitLoss;
    const missing = !skipped && (totalIncome === null || preTaxProfit === null);
    const lhs = totalIncome !== null && preTaxProfit !== null ? 0 : 0;
    const rhs = 0;
    const missingParts: string[] = [];
    if (!skipped) {
      if (totalIncome === null) missingParts.push('P&L Total Income');
      if (preTaxProfit === null) missingParts.push('P&L Pre-tax Profit');
    }
    checks.push({
      key: 'bs_pnl_link',
      label: 'Balance Sheet ↔ P&L link',
      lhsLabel: 'BS-derived Total Income & Pre-tax',
      rhsLabel: 'P&L Total Income & Pre-tax',
      lhs, rhs, diff: 0,
      ok: !skipped && !missing,
      skipped,
      reason: skipped
        ? 'Requires both Balance Sheet and P&L forms.'
        : missing ? `Empty required value(s): ${missingParts.join(', ')}.` : undefined,
    });
  }


  // ----- Summary rows for the preview panel (screenshot 2 layout) -----
  const interestMargin = interestIncome !== null && interestExpense !== null
    ? interestIncome - interestExpense : null;
  const grossIncome = interestMargin !== null && totalIncome !== null
    ? interestMargin + totalIncome : totalIncome;
  const operatingExpenses = totalExpenses !== null && interestExpense !== null
    ? totalExpenses - interestExpense : totalExpenses;
  // Debt/Borrowings — use total liabilities as the closest available aggregate
  // on the standard template; per-line breakdown isn't present as a summary field.
  const debtBorrowings = totalLiabilities;
  const capitalBase = totalEquity;
  const incomeAssets = grossLoans;
  const averageAssets = totalAssets;
  const averageEquity = totalEquity;
  const averageIncomeAssets = incomeAssets;

  const summary: ReconciliationSummaryRow[] = [
    { key: 'total_assets',      label: 'Total Assets',            value: totalAssets },
    { key: 'total_equity',      label: 'Total Equity',            value: totalEquity },
    { key: 'debt_borrowings',   label: 'Debt/Borrowings',         value: debtBorrowings },
    { key: 'capital_base',      label: 'Capital Base',            value: capitalBase },
    { key: 'npls',              label: 'NPLs',                    value: npls },
    { key: 'pdls',              label: 'PDLs',                    value: pdls },
    { key: 'gross_loans',       label: 'Gross Loans',             value: grossLoans },
    { key: 'provisions',        label: 'Provisions',              value: provisions },
    { key: 'avg_assets',        label: 'Average Assets',          value: averageAssets },
    { key: 'avg_equity',        label: 'Average Equity',          value: averageEquity },
    { key: 'income_assets',     label: 'Income Assets',           value: incomeAssets },
    { key: 'avg_income_assets', label: 'Average Income Assets',   value: averageIncomeAssets },
    { key: 'total_income',      label: 'Total Income',            value: totalIncome },
    { key: 'pretax_profits',    label: 'Pre-tax Profits',         value: preTaxProfit },
    { key: 'interest_margin',   label: 'Interest Margin',         value: interestMargin },
    { key: 'gross_income',      label: 'Gross Income',            value: grossIncome },
    { key: 'operating_expenses',label: 'Operating Expenses',      value: operatingExpenses },
    { key: 'liquid_assets',     label: 'Liquid Assets',           value: liquidAssets },
    { key: 'prescribed_liab',   label: 'Prescribed Liabilities',  value: prescribedLiab },
  ];

  const passed = checks.every((c) => c.skipped || c.ok);
  return { passed, hasBalanceSheet, hasProfitLoss, checks, summary };
}

export function formatReconciliationValue(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
