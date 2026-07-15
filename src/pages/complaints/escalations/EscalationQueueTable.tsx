import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { SeverityBadge, StatusChip } from './severityBadge';
import { MOCK_CASES, MOCK_COMPLAINTS, MOCK_RULES } from './mockData';
import { TIER_LABEL, type CaseStatus, type EscalationCase } from './types';
import { EscalationCaseDrawer } from './EscalationCaseDrawer';

export function EscalationQueueTable() {
  const [cases, setCases] = useState<EscalationCase[]>(MOCK_CASES);
  const [rule, setRule] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [active, setActive] = useState<EscalationCase | null>(null);

  const rows = useMemo(() => cases.filter((c) => {
    if (rule !== 'all' && c.ruleKey !== rule) return false;
    if (status !== 'all' && c.status !== status) return false;
    if (q) {
      const cx = MOCK_COMPLAINTS.find((x) => x.id === c.complaintId);
      const hay = `${cx?.number} ${cx?.institution} ${cx?.subject}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [cases, rule, status, q]);

  const update = (id: string, patch: Partial<EscalationCase>, msg: string) => {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    toast.success(msg);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Auto-Escalation Queue</CardTitle>
        <div className="flex flex-wrap gap-2 pt-2">
          <Input placeholder="Search complaint / institution…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
          <Select value={rule} onValueChange={setRule}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Rule" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rules</SelectItem>
              {MOCK_RULES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {['all','pending','acknowledged','escalated','dismissed','snoozed'].map((s) => (
                <SelectItem key={s} value={s}>{s === 'all' ? 'All statuses' : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Complaint</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Trigger reason</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Target tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const cx = MOCK_COMPLAINTS.find((x) => x.id === c.complaintId);
              return (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setActive(c)}>
                  <TableCell>
                    <div className="font-mono text-xs">{cx?.number}</div>
                    <div className="text-xs text-slate-600 truncate max-w-[220px]">{cx?.subject}</div>
                  </TableCell>
                  <TableCell className="text-sm">{cx?.institution}</TableCell>
                  <TableCell className="text-sm">{c.ruleLabel}</TableCell>
                  <TableCell className="text-xs text-slate-700 max-w-[240px]">{c.triggerReason}</TableCell>
                  <TableCell><SeverityBadge severity={c.severity} /></TableCell>
                  <TableCell className="text-sm">{TIER_LABEL[c.targetTier]}</TableCell>
                  <TableCell><StatusChip status={c.status} /></TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {c.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => update(c.id, { status: 'acknowledged' as CaseStatus }, 'Acknowledged')}>Ack</Button>
                      )}
                      {c.status !== 'escalated' && c.status !== 'dismissed' && (
                        <Button size="sm" onClick={() => update(c.id, { status: 'escalated' as CaseStatus }, 'Escalated to ' + TIER_LABEL[c.targetTier])}>Escalate</Button>
                      )}
                      {c.status !== 'dismissed' && (
                        <Button size="sm" variant="ghost" onClick={() => update(c.id, { status: 'dismissed' as CaseStatus }, 'Dismissed')}>Dismiss</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-slate-500 py-8">No escalation cases match your filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <EscalationCaseDrawer open={!!active} onOpenChange={(o) => !o && setActive(null)} caseData={active} />
    </Card>
  );
}
