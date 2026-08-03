import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, ExternalLink, PauseCircle, PlayCircle, Copy } from 'lucide-react';
import { EngineRule, RULE_MODULES, RULE_TYPES, describeRule } from '@/lib/ruleEngine';

const LEGACY_RULE_MODULES = [
  { label: 'Return Validation Rules', href: '/admin/return-config', desc: 'Field, cross-field and expression validation on return forms.' },
  { label: 'Prudential Thresholds', href: '/supervision/breaches', desc: 'Ratio thresholds and breach detection for prudential returns.' },
  { label: 'Conduct Monitoring Rules', href: '/admin/conduct/monitoring-rules', desc: 'Conduct signal sweeps feeding entity risk profiles.' },
  { label: 'Complaint Triage Rules', href: '/admin/conduct/triage-rules', desc: 'Auto-classification of complaints at intake.' },
  { label: 'Sufficiency Rules', href: '/admin/sufficiency-rules', desc: 'Completeness checks for licensing applications.' },
  { label: 'RFI Auto-Rules', href: '/admin/rfi-auto-rules', desc: 'Suggested RFI prompts for reviewers.' },
  { label: 'Correspondence Routing Rules', href: '/admin/correspondence-routing', desc: 'Classification and routing of inbound correspondence.' },
  { label: 'Escalation Rules', href: '/admin/escalations', desc: 'Tiered escalation and alert progression.' },
];

const statusVariant = (s: string) => (s === 'active' ? 'approved' : s === 'draft' ? 'draft' : 'secondary');

export default function RuleLibrary() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<EngineRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [deactivating, setDeactivating] = useState<EngineRule | null>(null);
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('engine_rules' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    else setRules((data as any as EngineRule[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rules.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !`${r.rule_code} ${r.name} ${r.description ?? ''} ${(r.tags || []).join(' ')}`.toLowerCase().includes(q)) return false;
    if (moduleFilter !== 'all' && r.module !== moduleFilter) return false;
    if (typeFilter !== 'all' && r.rule_type !== typeFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
    return true;
  }), [rules, search, moduleFilter, typeFilter, statusFilter, severityFilter]);

  const counts = useMemo(() => ({
    total: rules.length,
    active: rules.filter((r) => r.status === 'active').length,
    draft: rules.filter((r) => r.status === 'draft').length,
    inactive: rules.filter((r) => r.status === 'inactive').length,
  }), [rules]);

  const activate = async (r: EngineRule) => {
    setBusy(true);
    const { error } = await supabase.rpc('engine_rule_activate' as any, { _rule_id: r.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${r.rule_code} activated`);
    load();
  };

  const deactivate = async () => {
    if (justification.trim().length < 10) return toast.error('Justification must be at least 10 characters.');
    setBusy(true);
    const { error } = await supabase.rpc('engine_rule_deactivate' as any, {
      _rule_id: deactivating!.id, _justification: justification.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${deactivating!.rule_code} deactivated`);
    setDeactivating(null); setJustification(''); load();
  };

  const clone = async (r: EngineRule) => {
    const { error } = await supabase.rpc('engine_rule_save' as any, {
      _payload: {
        name: `${r.name} (copy)`, description: r.description, rule_type: r.rule_type,
        module: r.module, sub_module: r.sub_module, tags: r.tags, severity: r.severity,
        conditions: r.conditions, actions: r.actions, suppression_days: r.suppression_days,
      },
    });
    if (error) return toast.error(error.message);
    toast.success('Rule cloned as draft');
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Rule Engine — Rule Library"
          description="Central library of supervisory rules: thresholds, trends, patterns, SLAs, routing and scheduling."
          actions={
            <Button data-rbac="rule_engine.edit" onClick={() => navigate('/admin/rule-engine/new')}>
              <Plus className="h-4 w-4 mr-2" /> New Rule
            </Button>
          }
        />

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'Total rules', value: counts.total },
            { label: 'Active', value: counts.active },
            { label: 'Draft', value: counts.draft },
            { label: 'Inactive', value: counts.inactive },
          ].map((k) => (
            <Card key={k.label}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="text-2xl font-semibold font-mono">{k.value}</div>
            </CardContent></Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <Input placeholder="Search code, name, tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {RULE_MODULES.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue placeholder="Rule type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {RULE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  {['low', 'medium', 'high', 'critical'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No rules match these filters. Create a rule to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last triggered</TableHead>
                    <TableHead>Fires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/admin/rule-engine/${r.id}`)}>
                        <TableCell className="font-mono text-xs">{r.rule_code}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{describeRule(r)}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{RULE_TYPES.find((t) => t.value === r.rule_type)?.label ?? r.rule_type}</Badge></TableCell>
                        <TableCell className="text-xs capitalize">{r.module?.replace(/_/g, ' ')}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{r.severity}</Badge></TableCell>
                        <TableCell><Badge variant={statusVariant(r.status) as any} className="capitalize">{r.status}</Badge></TableCell>
                        <TableCell className="text-xs font-mono">{r.last_triggered_at ? new Date(r.last_triggered_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{r.trigger_count}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button data-rbac="rule_engine.edit" size="sm" variant="ghost" onClick={() => clone(r)} title="Clone">
                              <Copy className="h-4 w-4" />
                            </Button>
                            {r.status === 'active' ? (
                              <Button data-rbac="rule_engine.activate" size="sm" variant="ghost" onClick={() => setDeactivating(r)} title="Deactivate">
                                <PauseCircle className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button data-rbac="rule_engine.activate" size="sm" variant="ghost" disabled={busy} onClick={() => activate(r)} title="Activate">
                                <PlayCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Module-specific rule configuration</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {LEGACY_RULE_MODULES.map((l) => (
              <button
                key={l.href}
                onClick={() => navigate(l.href)}
                className="text-left rounded-lg border p-3 hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{l.label}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{l.desc}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!deactivating} onOpenChange={(o) => { if (!o) { setDeactivating(null); setJustification(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deactivate {deactivating?.rule_code}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Justification (recorded in the audit trail)</Label>
            <Textarea rows={4} value={justification} onChange={(e) => setJustification(e.target.value)}
              placeholder="Why is this rule being switched off?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeactivating(null); setJustification(''); }}>Cancel</Button>
            <Button data-rbac="rule_engine.activate" variant="destructive" disabled={busy} onClick={deactivate}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
