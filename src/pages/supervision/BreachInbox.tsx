import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, ExternalLink, ShieldCheck, Gavel } from 'lucide-react';
import { logAction } from '@/hooks/useAuditLog';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import {
  prudentialBreachAcknowledge,
  prudentialBreachLinkEnforcement,
  supervisoryBreachIssueEnforcement,
} from '@/lib/prudentialGovernedOps';

type BreachRow = {
  id: string;
  return_id: string | null;
  entity_id: string | null;
  detection_run_id: string | null;
  return_filing_id: string | null;
  return_filing_version_id: string | null;
  reporting_period_id: string | null;
  period_label: string | null;
  period_end: string | null;
  filing_reference: string | null;
  filing_status: string | null;
  metric_key: string;
  level: string;
  comparator: string | null;
  threshold_value: number | null;
  threshold_version: string | null;
  value: number | null;
  risk_level: string | null;
  detected_at: string;
  acknowledged_at: string | null;
  acknowledgement_note: string | null;
  escalated_enforcement_id: string | null;
  return_config_id: string | null;
};


const LEVEL_META: Record<string, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-red-100 text-red-800' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-800' },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-800' },
  warning: { label: 'Warning', className: 'bg-yellow-100 text-yellow-800' },
  low: { label: 'Low', className: 'bg-slate-100 text-slate-700' },
  info: { label: 'Info', className: 'bg-slate-100 text-slate-700' },
};

function magnitude(row: BreachRow): number {
  if (row.threshold_value == null || row.value == null || row.threshold_value === 0) return 0;
  return Math.abs((row.value - row.threshold_value) / row.threshold_value);
}

export default function BreachInbox() {
  const [statusFilter, setStatusFilter] = useState<'open' | 'ack' | 'escalated' | 'all'>('open');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [ackTarget, setAckTarget] = useState<BreachRow | null>(null);
  const [ackNote, setAckNote] = useState('');
  const [escTarget, setEscTarget] = useState<BreachRow | null>(null);
  const [escNote, setEscNote] = useState('');
  const [escPenalty, setEscPenalty] = useState('');
  const [pendingOverride, setPendingOverride] = useState<null | { row: BreachRow; ruleKey: string; title: string; original: unknown; overridden: unknown; metadata: Record<string, unknown>; apply: () => Promise<void> }>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  // Canonical current-breach set: one authoritative outcome per filing version,
  // produced by the canonical detection engine. Superseded runs and withdrawn
  // filings are excluded by the view itself.
  const { data: breaches, isLoading } = useQuery({
    queryKey: ['prudential_breach_inbox'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_prudential_current_breaches')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        acknowledged_at: r.acknowledged_at_ts ?? r.acknowledged_at ?? null,
        acknowledgement_note: r.acknowledgement_note_text ?? r.acknowledgement_note ?? null,
      })) as BreachRow[];
    },
  });

  const entityIds = useMemo(
    () => Array.from(new Set((breaches ?? []).map(b => b.entity_id).filter(Boolean) as string[])),
    [breaches],
  );

  const { data: licenseesMap } = useQuery({
    queryKey: ['prudential_breach_licensees', entityIds.join(',')],
    enabled: entityIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('licensees').select('id, name').in('id', entityIds);
      const map = new Map<string, string>();
      (data ?? []).forEach((l: any) => map.set(l.id, l.name));
      return map;
    },
  });

  const enriched = useMemo(() => {
    return (breaches ?? []).map((b) => {
      const licenseeName = b.entity_id ? licenseesMap?.get(b.entity_id) : undefined;
      return {
        ...b,
        licenseeName,
        licenseeId: b.entity_id ?? undefined,
        periodLabel: b.period_label ?? (b.period_end ? b.period_end.slice(0, 10) : undefined),
        mag: magnitude(b),
      };
    });
  }, [breaches, licenseesMap]);


  const filtered = useMemo(() => {
    let list = enriched;
    if (statusFilter === 'open') list = list.filter(b => !b.acknowledged_at && !b.escalated_enforcement_id);
    else if (statusFilter === 'ack') list = list.filter(b => b.acknowledged_at && !b.escalated_enforcement_id);
    else if (statusFilter === 'escalated') list = list.filter(b => !!b.escalated_enforcement_id);
    if (levelFilter !== 'all') list = list.filter(b => b.level === levelFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.metric_key.toLowerCase().includes(q) ||
        (b.licenseeName || '').toLowerCase().includes(q) ||
        (b.filing_reference || '').toLowerCase().includes(q) ||
        (b.periodLabel || '').toLowerCase().includes(q),

      );
    }
    // sort: open first, then by magnitude desc, then detected_at desc
    return [...list].sort((a, b) => {
      const ao = a.acknowledged_at || a.escalated_enforcement_id ? 1 : 0;
      const bo = b.acknowledged_at || b.escalated_enforcement_id ? 1 : 0;
      if (ao !== bo) return ao - bo;
      if (b.mag !== a.mag) return b.mag - a.mag;
      return b.detected_at.localeCompare(a.detected_at);
    });
  }, [enriched, statusFilter, levelFilter, search]);

  const stats = useMemo(() => {
    const open = enriched.filter(b => !b.acknowledged_at && !b.escalated_enforcement_id).length;
    const critical = enriched.filter(b => (b.level === 'critical' || b.level === 'high') && !b.acknowledged_at && !b.escalated_enforcement_id).length;
    const escalated = enriched.filter(b => !!b.escalated_enforcement_id).length;
    const ack = enriched.filter(b => b.acknowledged_at && !b.escalated_enforcement_id).length;
    return { open, critical, escalated, ack };
  }, [enriched]);

  const levels = useMemo(() => Array.from(new Set(enriched.map(b => b.level))).sort(), [enriched]);

  const acknowledge = useMutation({
    mutationFn: async () => {
      if (!ackTarget) return;
      if (ackNote.trim().length < 5) throw new Error('Acknowledgement note required');
      // Governed operation: authority, note validation and the audit entry are
      // enforced server-side. Direct DML on return_threshold_breaches is revoked.
      await prudentialBreachAcknowledge(ackTarget.id, ackNote.trim());
    },
    onSuccess: () => {
      toast.success('Breach acknowledged');
      setAckTarget(null); setAckNote('');
      qc.invalidateQueries({ queryKey: ['prudential_breach_inbox'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const escalate = useMutation({
    mutationFn: async () => {
      if (!escTarget) return null;
      const row = enriched.find(b => b.id === escTarget.id);
      if (!row?.licenseeId) throw new Error('Missing licensee on this return — cannot escalate');
      if (escNote.trim().length < 15) throw new Error('Escalation summary required (min 15 chars)');
      const penalty = escPenalty !== '' && Number.isFinite(Number(escPenalty)) ? Number(escPenalty) : null;
      const rationale = penalty !== null
        ? `${escNote.trim()}\n\nProposed penalty: ${penalty}`
        : escNote.trim();
      // Governed operation: opens the enforcement case, cites the breach and
      // writes the enforcement + audit trail in one transaction.
      const result = await supervisoryBreachIssueEnforcement({
        entityId: row.licenseeId,
        breachIds: [escTarget.id],
        enforcementType: 'prudential_breach',
        rationale,
      });
      const caseId = (result as any)?.enforcement_case_id as string | undefined;
      if (caseId) {
        await prudentialBreachLinkEnforcement(escTarget.id, caseId, rationale);
      }
      return caseId ?? null;
    },
    onSuccess: (newId) => {
      toast.success('Escalated to enforcement');
      setEscTarget(null); setEscNote(''); setEscPenalty('');
      qc.invalidateQueries({ queryKey: ['prudential_breach_inbox'] });
      if (newId) navigate(`/enforcement/${newId}`);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <DashboardLayout>
      <PageHeader title="Prudential breach inbox" description="Threshold breaches across all licensees. Acknowledge or escalate to enforcement." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Open</div><div className="text-2xl font-semibold">{stats.open}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Critical / High (open)</div><div className="text-2xl font-semibold text-red-600">{stats.critical}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Acknowledged</div><div className="text-2xl font-semibold">{stats.ack}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Escalated</div><div className="text-2xl font-semibold">{stats.escalated}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs">Search</Label>
              <Input placeholder="Metric, licensee or return ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="w-40">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="ack">Acknowledged</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label className="text-xs">Severity</Label>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {levels.map((l) => <SelectItem key={l} value={l}>{LEVEL_META[l]?.label ?? l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading breaches…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No breaches match the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">Licensee</th>
                    <th className="p-2">Metric</th>
                    <th className="p-2">Value vs threshold</th>
                    <th className="p-2">Severity</th>
                    <th className="p-2">Detected</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const lvl = LEVEL_META[b.level] ?? { label: b.level, className: 'bg-slate-100 text-slate-700' };
                    const cmp = b.comparator ?? '';
                    const magPct = b.mag ? `${(b.mag * 100).toFixed(1)}%` : '';
                    const closed = !!b.acknowledged_at || !!b.escalated_enforcement_id;
                    return (
                      <tr key={b.id} className="border-b hover:bg-muted/40">
                        <td className="p-2">
                          <div className="font-medium">
                            {b.licenseeId ? (
                              <Link to={`/entities/${b.licenseeId}`} className="hover:underline">{b.licenseeName ?? '—'}</Link>
                            ) : (b.licenseeName ?? '—')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {b.return_filing_id ? (
                              <Link to={`/returns/filings/${b.return_filing_id}`} className="hover:underline inline-flex items-center gap-1">
                                {b.filing_reference ?? b.return_filing_id.slice(0, 8)} <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : (b.filing_reference ?? '—')}
                            {b.periodLabel && <span className="ml-1">· {b.periodLabel}</span>}
                          </div>
                        </td>
                        <td className="p-2 font-mono text-xs">{b.metric_key}</td>
                        <td className="p-2 text-xs">

                          <div>{b.value ?? '—'} {cmp} {b.threshold_value ?? '—'}</div>
                          {magPct && <div className="text-muted-foreground">Δ {magPct}</div>}
                        </td>
                        <td className="p-2"><Badge className={lvl.className}>{lvl.label}</Badge></td>
                        <td className="p-2 text-xs">{new Date(b.detected_at).toLocaleString()}</td>
                        <td className="p-2 text-xs">
                          {b.escalated_enforcement_id ? (
                            <Link to={`/enforcement/${b.escalated_enforcement_id}`} className="text-red-700 hover:underline inline-flex items-center gap-1">
                              Escalated <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : b.acknowledged_at ? (
                            <span className="text-emerald-700">Acknowledged</span>
                          ) : (
                            <span className="text-amber-700">Open</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex gap-1 justify-end">
                            <HistoryButton entityType="prudential_breach" entityId={b.id} title="Breach history" variant="ghost" />
                            {!closed && (
                              <>
                                <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => { setAckTarget(b); setAckNote(''); }}>
                                  <ShieldCheck className="h-3 w-3 mr-1" /> Ack
                                </Button>
                                <Button data-rbac="prudential_supervision.initiate_supervisory_action" size="sm" variant="destructive" onClick={() => { setEscTarget(b); setEscNote(''); setEscPenalty(''); }}>
                                  <Gavel className="h-3 w-3 mr-1" /> Escalate
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acknowledge dialog */}
      <Dialog open={!!ackTarget} onOpenChange={(o) => { if (!o) setAckTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge breach</DialogTitle>
          </DialogHeader>
          {ackTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded border p-2 bg-muted/40">
                <div><span className="text-muted-foreground">Metric:</span> <span className="font-mono">{ackTarget.metric_key}</span></div>
                <div><span className="text-muted-foreground">Value:</span> {ackTarget.value} {ackTarget.comparator} {ackTarget.threshold_value}</div>
              </div>
              <div>
                <Label>Analyst note</Label>
                <Textarea rows={4} value={ackNote} onChange={(e) => setAckNote(e.target.value)} placeholder="Reason for acknowledging without escalation…" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckTarget(null)}>Cancel</Button>
            <Button data-rbac="prudential_supervision.edit" onClick={() => {
              if (!ackTarget) return;
              const highRisk = ackTarget.level === 'critical' || ackTarget.level === 'high';
              if (highRisk) {
                setPendingOverride({
                  row: ackTarget,
                  ruleKey: 'prudential.breach.no_escalation',
                  title: `Acknowledge ${ackTarget.level} breach without escalation`,
                  original: { status: 'open', level: ackTarget.level },
                  overridden: { status: 'acknowledged', note: ackNote.trim() },
                  metadata: {
                    source: 'phase1_override_framework',
                    screen: 'BreachInbox',
                    breach_id: ackTarget.id,
                    return_id: ackTarget.return_id,
                    metric_key: ackTarget.metric_key,
                    previous_severity: ackTarget.level,
                    threshold_value: ackTarget.threshold_value,
                    value: ackTarget.value,
                  },
                  apply: async () => { await acknowledge.mutateAsync(); },
                });
              } else {
                acknowledge.mutate();
              }
            }} disabled={acknowledge.isPending}>
              {acknowledge.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Acknowledge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate dialog */}
      <Dialog open={!!escTarget} onOpenChange={(o) => { if (!o) setEscTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate to enforcement</DialogTitle>
          </DialogHeader>
          {escTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded border p-2 bg-muted/40">
                <div><span className="text-muted-foreground">Metric:</span> <span className="font-mono">{escTarget.metric_key}</span></div>
                <div><span className="text-muted-foreground">Value:</span> {escTarget.value} {escTarget.comparator} {escTarget.threshold_value}</div>
              </div>
              <div>
                <Label>Case summary</Label>
                <Textarea rows={4} value={escNote} onChange={(e) => setEscNote(e.target.value)} placeholder="Why enforcement is warranted…" />
              </div>
              <div>
                <Label>Provisional penalty (optional)</Label>
                <Input type="number" value={escPenalty} onChange={(e) => setEscPenalty(e.target.value)} placeholder="Leave blank to decide later" />
              </div>
              <div className="text-xs text-muted-foreground flex items-start gap-2">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                Creates a new enforcement case and jumps you to its detail page.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscTarget(null)}>Cancel</Button>
            <Button data-rbac="prudential_supervision.initiate_supervisory_action" variant="destructive" onClick={() => escalate.mutate()} disabled={escalate.isPending}>
              {escalate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create enforcement case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingOverride && (
        <OverrideReasonDialog
          open={!!pendingOverride}
          onOpenChange={(o) => { if (!o) setPendingOverride(null); }}
          module="prudential_returns"
          entityType="prudential_breach"
          entityId={pendingOverride.row.id}
          ruleKey={pendingOverride.ruleKey}
          title={pendingOverride.title}
          originalValue={pendingOverride.original}
          overriddenValue={pendingOverride.overridden}
          metadata={pendingOverride.metadata}
          onOverridden={async () => { await pendingOverride.apply(); setPendingOverride(null); }}
        />
      )}
    </DashboardLayout>
  );
}
