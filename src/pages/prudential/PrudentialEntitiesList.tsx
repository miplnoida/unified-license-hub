import { usePrudentialEntities } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Link, useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMemo, useState } from 'react';

const RISK_TONE: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-500/10 text-amber-700 border-amber-200',
  medium: 'bg-amber-500/10 text-amber-700 border-amber-200',
  low: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
};

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
    if (retStatus !== 'all' && e.last_return_status !== retStatus) return false;
    return true;
  }), [data, actionState, escState, retStatus]);

  const updateParam = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value && value !== 'all') p.set(key, value); else p.delete(key);
    setParams(p, { replace: true });
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Prudentially Supervised Entities</h1>
        <p className="text-sm text-muted-foreground">Universe of supervised entities with current prudential status</p>
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
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
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
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? 'Loading…' : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead>Systemic</TableHead>
                  <TableHead>Latest rating</TableHead>
                  <TableHead>Worst breach</TableHead>
                  <TableHead className="text-right">Breaches</TableHead>
                  <TableHead className="text-right">Open actions</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Escalations</TableHead>
                  <TableHead className="text-right">Stress</TableHead>
                  <TableHead>Last return</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell><Badge variant="outline">{e.status || '—'}</Badge></TableCell>
                      <TableCell>{e.systemic_importance ? <Badge>{e.systemic_importance}</Badge> : '—'}</TableCell>
                      <TableCell>{e.latest_rating || '—'}</TableCell>
                      <TableCell>{e.worst_breach ? <Badge className={RISK_TONE[e.worst_breach] || ''}>{e.worst_breach}</Badge> : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.breach_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.open_actions}</TableCell>
                      <TableCell className={`text-right tabular-nums ${e.overdue_actions ? 'text-destructive font-semibold' : ''}`}>{e.overdue_actions}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.open_escalations}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.stress_open}</TableCell>
                      <TableCell>{e.last_return ? new Date(e.last_return).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-right"><Link className="text-primary underline" to={`/prudential/entities/${e.id}`}>Open</Link></TableCell>
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
  );
}
