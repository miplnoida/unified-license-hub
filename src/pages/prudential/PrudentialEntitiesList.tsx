import { usePrudentialEntities } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Link, useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { severityLabel, severityTone, SEVERITY_FILTER_OPTIONS } from '@/lib/prudentialSeverity';

const NEUTRAL = 'bg-muted text-muted-foreground border-border';
const EMERALD = 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
const AMBER = 'bg-amber-500/10 text-amber-700 border-amber-200';
const AMBER_STRONG = 'bg-amber-500/20 text-amber-800 border-amber-300';
const RED = 'bg-destructive/10 text-destructive border-destructive/30';
const BLUE = 'bg-blue-500/10 text-blue-700 border-blue-200';

const LICENSE_TONE: Record<string, string> = {
  active: EMERALD,
  suspended: AMBER,
  revoked: RED,
  expired: NEUTRAL,
};

const SYSTEMIC_TONE = (v: string) => {
  const s = v.toLowerCase();
  if (/(d-sib|systemic|high)/.test(s)) return RED;
  if (/medium|moderate/.test(s)) return AMBER;
  return NEUTRAL;
};

const RATING_TONE = (v: string) => {
  const s = v.toLowerCase();
  if (s.includes('critical')) return RED;
  if (s.includes('high')) return AMBER_STRONG;
  if (s.includes('medium') || s.includes('moderate')) return AMBER;
  if (s.includes('low')) return EMERALD;
  return NEUTRAL;
};

const RETURN_STATUS_TONE: Record<string, string> = {
  approved: EMERALD,
  submitted: BLUE,
  under_review: BLUE,
  rejected: RED,
};

const COLUMN_HELP: Record<string, string> = {
  Entity: 'Supervised institution name. Use the view button on the row to open its full prudential profile.',
  License: 'Current license status (Active / Suspended / Revoked / Expired).',
  Systemic: 'Systemic-importance classification (e.g. D-SIB / Non-SIB) driving supervisory priority.',
  'Latest rating': 'Most recent supervisory risk rating from the latest prudential assessment.',
  'Worst breach': 'Most severe outcome among currently open threshold breaches on prudential ratios (Breach / Warning / Within limits).',
  Breaches: 'Count of open (unresolved) threshold breaches across all monitored ratios.',
  'Open actions': 'Supervisory actions currently open (directives, requirements, follow-ups).',
  Overdue: 'Open actions whose due date has passed. Highlighted red when greater than zero.',
  Escalations: 'Escalations raised for the entity (auto or manual) awaiting resolution.',
  Stress: 'Open stress-test / early-warning indicator events flagged for the entity.',
  'Last return': 'Date and status of the most recently submitted regulatory return.',
};

function HeaderLabel({ label }: { label: string }) {
  const help = COLUMN_HELP[label];
  if (!help) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3 w-3 text-muted-foreground/70 cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">{help}</TooltipContent>
      </Tooltip>
    </span>
  );
}

export default function PrudentialEntitiesList() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [risk, setRisk] = useState(params.get('risk') || 'all');
  const [status, setStatus] = useState(params.get('status') || 'all');
  const [actionState, setActionState] = useState(params.get('action') || 'all');
  const [escState, setEscState] = useState(params.get('esc') || 'all');
  const [retStatus, setRetStatus] = useState(params.get('ret') || 'all');

  const { data = [], isLoading } = usePrudentialEntities({
    search: q || undefined,
    status: status === 'all' ? undefined : status,
    risk: risk === 'all' ? undefined : risk,
  });

  const rows = useMemo(() => data.filter((e: any) => {
    if (actionState === 'has_overdue' && !e.overdue_actions) return false;
    if (actionState === 'open' && !e.open_actions) return false;
    if (escState === 'open' && !e.open_escalations) return false;
    if (retStatus !== 'all' && String(e.last_return_status ?? '').toUpperCase() !== retStatus) return false;
    return true;
  }), [data, actionState, escState, retStatus]);

  const updateParam = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value && value !== 'all') p.set(key, value); else p.delete(key);
    setParams(p, { replace: true });
  };

  return (
    <DashboardLayout>
      <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Prudentially Supervised Entities</h1>
        <p className="text-sm text-muted-foreground">Universe of supervised entities with current prudential status. Hover any column header for its definition.</p>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Entities ({rows.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Search entity…" value={q}
              onChange={(e) => { setQ(e.target.value); updateParam('q', e.target.value); }}
              className="max-w-xs" />
            <Select value={risk} onValueChange={(v) => { setRisk(v); updateParam('risk', v); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk levels</SelectItem>
                {SEVERITY_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); updateParam('status', v); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="License status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionState} onValueChange={(v) => { setActionState(v); updateParam('action', v); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Actions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All action states</SelectItem>
                <SelectItem value="open">Has open actions</SelectItem>
                <SelectItem value="has_overdue">Has overdue actions</SelectItem>
              </SelectContent>
            </Select>
            <Select value={escState} onValueChange={(v) => { setEscState(v); updateParam('esc', v); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Escalations" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All escalations</SelectItem>
                <SelectItem value="open">Has open escalations</SelectItem>
              </SelectContent>
            </Select>
            <Select value={retStatus} onValueChange={(v) => { setRetStatus(v); updateParam('ret', v); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Latest return" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All return statuses</SelectItem>
                {RETURN_STATUS_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? 'Loading…' : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead><HeaderLabel label="Entity" /></TableHead>
                  <TableHead><HeaderLabel label="License" /></TableHead>
                  <TableHead><HeaderLabel label="Systemic" /></TableHead>
                  <TableHead><HeaderLabel label="Latest rating" /></TableHead>
                  <TableHead><HeaderLabel label="Worst breach" /></TableHead>
                  <TableHead className="text-right"><HeaderLabel label="Breaches" /></TableHead>
                  <TableHead className="text-right"><HeaderLabel label="Open actions" /></TableHead>
                  <TableHead className="text-right"><HeaderLabel label="Overdue" /></TableHead>
                  <TableHead className="text-right"><HeaderLabel label="Escalations" /></TableHead>
                  <TableHead className="text-right"><HeaderLabel label="Stress" /></TableHead>
                  <TableHead><HeaderLabel label="Last return" /></TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>
                        {e.status
                          ? <Badge variant="outline" className={`capitalize ${LICENSE_TONE[String(e.status).toLowerCase()] || NEUTRAL}`}>{e.status}</Badge>
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {e.systemic_importance
                          ? <Badge variant="outline" className={`capitalize ${SYSTEMIC_TONE(String(e.systemic_importance))}`}>{e.systemic_importance}</Badge>
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {e.latest_rating
                          ? <Badge variant="outline" className={`capitalize ${RATING_TONE(String(e.latest_rating))}`}>{e.latest_rating}</Badge>
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {e.worst_breach
                          ? <Badge variant="outline" className={severityTone(e.worst_breach)}>{severityLabel(e.worst_breach)}</Badge>
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{e.breach_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.open_actions}</TableCell>
                      <TableCell className={`text-right tabular-nums ${e.overdue_actions ? 'text-destructive font-semibold' : ''}`}>{e.overdue_actions}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.open_escalations}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.stress_open}</TableCell>
                      <TableCell>
                        {e.last_return ? (
                          <div className="flex items-center gap-2">
                            <span>{new Date(e.last_return).toLocaleDateString()}</span>
                            {e.last_return_status && (
                              <Badge variant="outline" className={`capitalize ${RETURN_STATUS_TONE[e.last_return_status] || NEUTRAL}`}>
                                {String(e.last_return_status).replace(/_/g, ' ')}
                              </Badge>
                            )}
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button asChild variant="ghost" size="icon" aria-label={`View prudential profile for ${e.name}`}>
                              <Link to={`/prudential/entities/${e.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View prudential profile</TooltipContent>
                        </Tooltip>
                      </TableCell>

                    </TableRow>
                  ))}
                  {!rows.length && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">No entities match filters.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
