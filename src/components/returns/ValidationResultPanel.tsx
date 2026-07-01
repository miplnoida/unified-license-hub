import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import type { EvaluationSummary, ValidationResult } from '@/lib/returnsValidation';

interface Props {
  summary: EvaluationSummary;
  onNavigateField?: (formId: string | undefined, fieldKey: string) => void;
  compact?: boolean;
}

export function ValidationResultPanel({ summary, onNavigateField, compact }: Props) {
  const total = summary.results.length;
  const errCount = summary.errors.length;
  const warnCount = summary.warnings.length;
  const ok = errCount === 0 && warnCount === 0;

  const row = (r: ValidationResult) => (
    <li key={r.rule_id} className="flex items-start gap-2 py-2 border-b last:border-b-0">
      {r.severity === 'error'
        ? <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
        : <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{r.rule_name}</div>
        <div className="text-xs text-muted-foreground break-words">{r.message}</div>
        {r.field_refs?.length > 0 && onNavigateField && (
          <div className="flex flex-wrap gap-1 mt-1">
            {r.field_refs.map((f, i) => (
              <Button
                key={i} type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs"
                onClick={() => onNavigateField(f.form_id, f.field_key)}
              >
                {f.label || f.field_key}<ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            ))}
          </div>
        )}
      </div>
    </li>
  );

  return (
    <Card className={compact ? 'shadow-none border-dashed' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {ok
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            : <AlertTriangle className="h-4 w-4 text-warning" />}
          Validation Results
          <div className="ml-auto flex items-center gap-1">
            <Badge variant="outline" className="text-[10px]">{total} rules</Badge>
            {errCount > 0 && <Badge className="bg-destructive text-destructive-foreground text-[10px]">{errCount} errors</Badge>}
            {warnCount > 0 && <Badge className="bg-warning text-warning-foreground text-[10px]">{warnCount} warnings</Badge>}
            {ok && total > 0 && <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 text-[10px]" variant="outline">All passed</Badge>}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {total === 0 ? (
          <p className="text-xs text-muted-foreground italic">No validation rules configured for this return.</p>
        ) : ok ? (
          <p className="text-xs text-emerald-700">All configured checks passed.</p>
        ) : (
          <ul>
            {summary.errors.map(row)}
            {summary.warnings.map(row)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
