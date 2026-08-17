import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { severityLabel } from '@/lib/prudentialSeverity';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import type { ComputedRatio, DetectedBreach } from '@/lib/returnsRatios';
import { formatRatioValue } from '@/lib/returnsRatios';

interface Props {
  ratios: ComputedRatio[];
  breaches?: DetectedBreach[];
}

export function RatioSummaryCard({ ratios, breaches = [] }: Props) {
  const breachBy = new Map(breaches.map((b) => [b.metric_key, b]));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Prudential Ratios
          {breaches.length > 0 && (
            <Badge className="ml-auto bg-destructive text-destructive-foreground text-[10px]">
              {breaches.length} breach{breaches.length === 1 ? '' : 'es'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {ratios.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No ratios configured.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {ratios.map((r) => {
              const b = breachBy.get(r.metric_key || r.ratio_key);
              return (
                <div key={r.ratio_key} className="border rounded-md p-2">
                  <div className="text-xs text-muted-foreground truncate">{r.label}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`text-lg font-mono ${b ? (b.level === 'breach' ? 'text-destructive' : 'text-warning') : ''}`}>
                      {formatRatioValue(r.value, r.display_format)}
                    </div>
                    {b && (
                      <Badge variant="outline" className={b.level === 'breach' ? 'text-destructive border-destructive' : 'text-warning border-warning'}>
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {severityLabel(b.level)} · {b.comparator} {b.threshold_value}
                      </Badge>
                    )}
                  </div>
                  {r.error && <div className="text-[10px] text-destructive mt-1">{r.error}</div>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
