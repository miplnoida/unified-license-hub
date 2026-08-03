import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Activity, ArrowUpCircle, Clock, ShieldAlert, Settings2 } from 'lucide-react';
import { EscalationDetailDrawer } from '@/components/escalations/EscalationDetailDrawer';
import {
  SEVERITY_TONE,
  TIER_LABEL,
  humanise,
  useEscalationFeed,
  useEscalationHealth,
  useEscalationRules,
  useEscalationStats,
  type EscalationFilters,
} from '@/hooks/useEscalations';

const MODULES = ['complaint_management', 'prudential_supervision', 'market_conduct', 'application_management', 'license_management', 'coordination', 'system_health'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const OPEN_STATUSES = ['open', 'acknowledged', 'in_progress', 'escalated'];
const CLOSED_STATUSES = ['resolved', 'closed'];

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: string }) {
  return (
    <Card>
      <CardContent className="pt-4 flex items-center gap-3">
        <div className={`p-2 rounded ${tone}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EscalationTable({ statuses }: { statuses: string[] }) {
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [tier, setTier] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);

  const filters: EscalationFilters = useMemo(() => ({
    statuses,
    modules: module === 'all' ? undefined : [module],
    severities: severity === 'all' ? undefined : [severity],
    tiers: tier === 'all' ? undefined : [Number(tier)],
    search,
    limit: 100,
  }), [statuses, module, severity, tier, search]);

  const { data, isLoading } = useEscalationFeed(filters);
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <Input placeholder="Search reference or source…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={module} onValueChange={setModule}>
          <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {MODULES.map((m) => <SelectItem key={m} value={m}>{humanise(m)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{humanise(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger><SelectValue placeholder="Tier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {[0, 1, 2, 3].map((t) => <SelectItem key={t} value={String(t)}>{TIER_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Age (h)</TableHead>
            <TableHead>Deadlines</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r.id)}>
                <TableCell className="font-mono text-xs">{r.escalation_ref}</TableCell>
                <TableCell>
                  <div>{humanise(r.source_module)}</div>
                  <div className="text-xs text-muted-foreground">{r.source_reference ?? r.source_event}</div>
                </TableCell>
                <TableCell>{humanise(r.escalation_type)}</TableCell>
                <TableCell><Badge variant="outline" className={SEVERITY_TONE[r.severity]}>{r.severity}</Badge></TableCell>
                <TableCell><Badge variant="outline">{TIER_LABEL[r.current_tier]}</Badge></TableCell>
                <TableCell>{r.owner_name ?? r.assigned_role ?? '—'}</TableCell>
                <TableCell>{r.hours_open}</TableCell>
                <TableCell className="space-x-1">
                  {r.ack_overdue && <Badge variant="outline" className={SEVERITY_TONE.high}>Ack overdue</Badge>}
                  {r.resolution_overdue && <Badge variant="outline" className={SEVERITY_TONE.critical}>SLA breached</Badge>}
                  {!r.ack_overdue && !r.resolution_overdue && <span className="text-xs text-muted-foreground">{humanise(r.status)}</span>}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                {isLoading ? 'Loading…' : 'No escalations match these filters.'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <EscalationDetailDrawer id={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function RulesTab() {
  const { data: rules = [], isLoading } = useEscalationRules();
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Rule</TableHead>
          <TableHead>Module</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Initial → Tier 1 → Tier 2 → Tier 3</TableHead>
          <TableHead>Thresholds (min)</TableHead>
          <TableHead>Options</TableHead>
          <TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rules.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.active_escalations} active</div>
              </TableCell>
              <TableCell>{humanise(r.source_module)}</TableCell>
              <TableCell>{humanise(r.escalation_type)}</TableCell>
              <TableCell className="text-xs">
                {[r.initial_recipient_role, r.tier1_recipient_role, r.tier2_recipient_role, r.tier3_recipient_role]
                  .filter(Boolean).map(humanise).join(' → ')}
              </TableCell>
              <TableCell className="text-xs font-mono">
                {[r.tier1_ack_threshold_minutes, r.tier2_ack_threshold_minutes, r.tier3_ack_threshold_minutes]
                  .filter((v) => v != null).join(' / ') || '—'}
                {r.resolution_threshold_minutes ? ` · resolve ${r.resolution_threshold_minutes}` : ''}
              </TableCell>
              <TableCell className="text-xs space-x-1">
                {r.business_hours_only && <Badge variant="outline">Business hours</Badge>}
                {r.pause_on_acknowledgement && <Badge variant="outline">Pause on ack</Badge>}
                {r.create_task && <Badge variant="outline">Task</Badge>}
                {r.create_case && <Badge variant="outline">Case</Badge>}
              </TableCell>
              <TableCell><Badge variant={r.is_active ? 'default' : 'outline'}>{r.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
            </TableRow>
          ))}
          {!rules.length && (
            <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
              {isLoading ? 'Loading…' : 'No routing rules configured.'}
            </TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SystemHealthTab() {
  const { data, isLoading } = useEscalationHealth();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Health signals (last 24 hours)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Signal</TableHead><TableHead>Subject</TableHead>
              <TableHead>Failures</TableHead><TableHead>Last seen</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data?.signals ?? []).map((s, i) => (
                <TableRow key={`${s.signal_key}-${s.subject}-${i}`}>
                  <TableCell>{humanise(s.signal_key)}</TableCell>
                  <TableCell className="font-mono text-xs">{s.subject ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={s.failure_count >= 3 ? SEVERITY_TONE.critical : SEVERITY_TONE.medium}>
                      {s.failure_count}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.last_seen ? new Date(s.last_seen).toLocaleString() : '—'}</TableCell>
                </TableRow>
              ))}
              {!(data?.signals ?? []).length && (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                  {isLoading ? 'Loading…' : 'No failures detected in the last 24 hours.'}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Open system-health escalations</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Reference</TableHead><TableHead>Type</TableHead>
              <TableHead>Tier</TableHead><TableHead>Acknowledged</TableHead><TableHead>Raised</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data?.open_health_escalations ?? []).map((e: any) => (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => setSelected(e.id)}>
                  <TableCell className="font-mono text-xs">{e.escalation_ref}</TableCell>
                  <TableCell>{humanise(e.escalation_type)}</TableCell>
                  <TableCell><Badge variant="outline">{TIER_LABEL[e.current_tier]}</Badge></TableCell>
                  <TableCell>{e.acknowledged_at ? new Date(e.acknowledged_at).toLocaleString() : 'Pending'}</TableCell>
                  <TableCell>{new Date(e.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!(data?.open_health_escalations ?? []).length && (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  No open system-health escalations.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EscalationDetailDrawer id={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

export default function EscalationManager() {
  const { data: stats } = useEscalationStats();

  return (
    <DashboardLayout>
      <PageHeader
        title="Escalation & Alert Manager"
        description="One register for every escalation raised across complaints, prudential supervision, conduct, workflow SLAs and system health — with tiered routing, acknowledgement tracking and audited resolution."
      />

      <div className="grid gap-3 md:grid-cols-5 mb-4">
        <Stat icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Open escalations" value={stats?.open ?? 0} tone="bg-destructive/10" />
        <Stat icon={<Clock className="h-4 w-4 text-amber-700" />} label="Ack overdue" value={stats?.unacknowledged_overdue ?? 0} tone="bg-amber-500/10" />
        <Stat icon={<ArrowUpCircle className="h-4 w-4 text-primary" />} label="At tier 3" value={stats?.tier3 ?? 0} tone="bg-primary/10" />
        <Stat icon={<ShieldAlert className="h-4 w-4 text-destructive" />} label="SLA breached" value={stats?.resolution_breached ?? 0} tone="bg-destructive/10" />
        <Stat icon={<Activity className="h-4 w-4 text-emerald-700" />} label="Resolved (30d)" value={stats?.resolved_30d ?? 0} tone="bg-emerald-500/10" />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active"><AlertTriangle className="h-4 w-4 mr-2" />Active</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="rules"><Settings2 className="h-4 w-4 mr-2" />Routing rules</TabsTrigger>
          <TabsTrigger value="health"><Activity className="h-4 w-4 mr-2" />System health</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4"><EscalationTable statuses={OPEN_STATUSES} /></TabsContent>
        <TabsContent value="resolved" className="mt-4"><EscalationTable statuses={CLOSED_STATUSES} /></TabsContent>
        <TabsContent value="rules" className="mt-4"><RulesTab /></TabsContent>
        <TabsContent value="health" className="mt-4"><SystemHealthTab /></TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
