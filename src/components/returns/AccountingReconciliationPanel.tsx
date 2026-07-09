import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import {
  evaluateAccountingReconciliation,
  formatReconciliationValue,
  type ReconciliationForm,
} from '@/lib/returnsAccountingReconciliation';

interface Props {
  allData: Record<string, Record<string, any>>;
  forms: ReconciliationForm[];
  summaryOnly?: boolean;
}

export function AccountingReconciliationPanel({ allData, forms, summaryOnly = false }: Props) {
  const result = evaluateAccountingReconciliation(allData, forms);

  if (!result.hasBalanceSheet && !result.hasProfitLoss) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{summaryOnly ? 'Accounting Totals' : 'Accounting Reconciliation'}</span>
          {!summaryOnly && (result.passed ? (
            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200" variant="outline">
              <CheckCircle2 className="h-3 w-3 mr-1" /> All checks pass
            </Badge>
          ) : (
            <Badge className="bg-destructive/10 text-destructive border-destructive/30" variant="outline">
              <XCircle className="h-3 w-3 mr-1" /> Blocks submit
            </Badge>
          ))}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Check pills */}
        {!summaryOnly && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {result.checks.map((c) => {
            const Icon = c.skipped ? MinusCircle : c.ok ? CheckCircle2 : XCircle;
            const tone = c.skipped
              ? 'border-muted-foreground/30 text-muted-foreground'
              : c.ok
                ? 'border-emerald-200 text-emerald-700 bg-emerald-500/5'
                : 'border-destructive/30 text-destructive bg-destructive/5';
            return (
              <div key={c.key} className={`border rounded-md p-2 text-xs space-y-1 ${tone}`}>
                <div className="flex items-center gap-1 font-medium">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{c.label}</span>
                </div>
                <div className="text-[11px]">
                  <div>{c.lhsLabel}: <span className="tabular-nums">{formatReconciliationValue(c.lhs)}</span></div>
                  <div>{c.rhsLabel}: <span className="tabular-nums">{formatReconciliationValue(c.rhs)}</span></div>
                  {c.skipped ? (
                    <div className="italic">{c.reason || 'Skipped'}</div>
                  ) : (
                    <div>Diff: <span className="tabular-nums font-medium">{formatReconciliationValue(c.diff)}</span></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}

        {/* Totals summary (screenshot 2) */}
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <tbody>
              {result.summary.map((r, i) => (
                <tr key={r.key} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                  <td className="px-3 py-1.5 font-medium">{r.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatReconciliationValue(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!result.passed && (
          <p className="text-xs text-destructive">
            Resolve the failing check(s) above — the return cannot be submitted until Total Assets equal Total Liabilities + Equity, and Total Income − Total Expenses equals Pre-tax Profit.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
