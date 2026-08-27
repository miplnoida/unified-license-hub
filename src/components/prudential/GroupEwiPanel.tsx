import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { bandTone, formatRatioValue } from '@/lib/groupConsolidation';

export interface GroupAlert {
  id: string;
  rule_code: string;
  rule_name: string;
  severity: string;
  status: string;
  details?: Record<string, any> | null;
  fired_at: string;
}

export interface GroupBreach {
  metric_key: string;
  label?: string | null;
  licensee_id?: string | null;
  name?: string | null;
  entity_name?: string | null;
  value: number | null;
  threshold_value: number | null;
  comparator: string | null;
  risk_level: string | null;
  display_format?: string | null;
  scope?: string;
}

function describeDetails(details?: Record<string, any> | null): string | null {
  if (!details) return null;
  const parts = Object.entries(details)
    .filter(([k]) => k !== 'period_key')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Group-level early-warning alerts with acknowledgement. */
export function GroupEwiPanel({ alerts, onAcknowledge, canAct }: {
  alerts: GroupAlert[];
  onAcknowledge?: (id: string) => void;
  canAct?: boolean;
}) {
  if (!alerts?.length) return <p className="text-sm text-muted-foreground">No group early-warning alerts raised.</p>;
  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const detail = describeDetails(a.details);
        return (
          <div key={a.id} className="flex flex-wrap items-start gap-3 rounded-md border border-border/60 bg-card p-3">
            <Badge variant="outline" className={cn('text-[11px]', bandTone(a.severity))}>{a.severity}</Badge>
            <div className="min-w-[240px] flex-1">
              <p className="text-sm font-medium">{a.rule_name}</p>
              {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {a.rule_code}{a.details?.period_key ? ` · ${a.details.period_key}` : ''} · {new Date(a.fired_at).toLocaleString()}
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">{a.status}</Badge>
            {canAct && a.status === 'open' && (
              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => onAcknowledge?.(a.id)}>Acknowledge</Button>
            )}
          </div>
        );
      })}
    </div>
  );
}


/** Consolidated + member threshold breaches in one view. */
export function GroupBreachesPanel({ breaches }: { breaches: GroupBreach[] }) {
  if (!breaches?.length) return <p className="text-sm text-muted-foreground">No threshold breaches for this period.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scope</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Metric</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">Threshold</TableHead>
            <TableHead>Risk</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {breaches.map((b, i) => (
            <TableRow key={`${b.metric_key}-${b.licensee_id ?? 'group'}-${i}`}>
              <TableCell>
                <Badge variant="outline" className="text-[11px]">{b.scope === 'group' ? 'Consolidated' : 'Member'}</Badge>
              </TableCell>
              <TableCell className="text-sm">{b.entity_name ?? b.name ?? 'Group'}</TableCell>
              <TableCell className="text-sm font-medium">{b.label || b.metric_key}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatRatioValue(b.value, b.display_format)}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {b.comparator ?? ''} {formatRatioValue(b.threshold_value, b.display_format)}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn('text-[11px]', bandTone(b.risk_level))}>{b.risk_level ?? '—'}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
