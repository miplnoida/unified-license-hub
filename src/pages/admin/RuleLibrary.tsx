import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import { toast } from 'sonner';
import {
  Loader2, Plus, ExternalLink, PauseCircle, PlayCircle, Copy, Download, Play, History,
} from 'lucide-react';
import { RULE_TYPES } from '@/lib/ruleEngine';
import { MODULE_TESTER_SPECS, isModuleFamily } from '@/lib/moduleRuleTester';

import {
  FAMILY_KEYS, FAMILY_LABELS, InventoryRule, RuleInventoryFacets, RuleInventoryKpis,
  inventoryCsv, searchRuleInventory,
} from '@/lib/ruleInventory';


const PAGE_SIZE = 50;

const statusVariant = (s: string) => (s === 'active' ? 'approved' : s === 'draft' ? 'draft' : 'secondary');
const typeLabel = (t: string) => RULE_TYPES.find((x) => x.value === t)?.label ?? t.replace(/_/g, ' ');
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export default function RuleLibrary() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<InventoryRule[]>([]);
  const [kpis, setKpis] = useState<RuleInventoryKpis | null>(null);
  const [facets, setFacets] = useState<RuleInventoryFacets>({
    modules: [], sub_modules: [], rule_types: [], severities: [], tags: [],
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [family, setFamily] = useState('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [subModuleFilter, setSubModuleFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [triggeredFrom, setTriggeredFrom] = useState('');
  const [triggeredTo, setTriggeredTo] = useState('');
  const [sort, setSort] = useState('last_modified_at');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const [deactivating, setDeactivating] = useState<InventoryRule | null>(null);
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await searchRuleInventory({
        search, family, rule_type: typeFilter, status: statusFilter, severity: severityFilter,
        module: moduleFilter, sub_module: subModuleFilter, tag: tagFilter,
        triggered_from: triggeredFrom ? new Date(triggeredFrom).toISOString() : null,
        triggered_to: triggeredTo ? new Date(`${triggeredTo}T23:59:59`).toISOString() : null,
        sort, dir, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
      });
      setRows(res.rows);
      setTotal(res.total);
      setKpis(res.kpis);
      setFacets(res.facets);
    } catch (e: any) {
      toast.error(e.message === 'forbidden' ? 'You do not have access to the Rule Engine.' : e.message);
    }
    setLoading(false);
  }, [search, family, typeFilter, statusFilter, severityFilter, moduleFilter, subModuleFilter,
      tagFilter, triggeredFrom, triggeredTo, sort, dir, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, family, typeFilter, statusFilter, severityFilter,
    moduleFilter, subModuleFilter, tagFilter, triggeredFrom, triggeredTo]);

  // All nine governed families always render — an empty family is still governed.
  const families = useMemo(() => {
    const counts = kpis?.families || {};
    return FAMILY_KEYS.map((k) => ({ key: k, label: FAMILY_LABELS[k], count: counts[k] ?? 0 }));
  }, [kpis]);

  const resetFilters = () => {
    setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setSeverityFilter('all');
    setModuleFilter('all'); setSubModuleFilter('all'); setTagFilter('all');
    setTriggeredFrom(''); setTriggeredTo('');
  };


  const toggleSort = (col: string) => {
    if (sort === col) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('desc'); }
  };

  const rpcErrors = (data: any): string | null => {
    const errs = (data as any)?.errors;
    if (data && (data as any).ok === false) {
      return Array.isArray(errs) && errs.length ? errs.join(' ') : 'Operation not permitted.';
    }
    return null;
  };

  const activate = async (r: InventoryRule) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('engine_rule_activate' as any, { _rule_id: r.rule_id });
    setBusy(false);
    if (error) return toast.error(error.message);
    const failed = rpcErrors(data);
    if (failed) return toast.error(failed);
    toast.success(`${r.rule_code} activated`);
    load();
  };

  const deactivate = async () => {
    if (justification.trim().length < 10) return toast.error('Justification must be at least 10 characters.');
    setBusy(true);
    const { data, error } = await supabase.rpc('engine_rule_deactivate' as any, {
      _rule_id: deactivating!.rule_id, _justification: justification.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    const failed = rpcErrors(data);
    if (failed) return toast.error(failed);
    toast.success(`${deactivating!.rule_code} deactivated`);
    setDeactivating(null); setJustification(''); load();
  };

  const clone = async (r: InventoryRule) => {
    const { data: src, error: readErr } = await supabase
      .from('engine_rules' as any).select('*').eq('id', r.rule_id).maybeSingle();
    if (readErr || !src) return toast.error(readErr?.message || 'Rule not found');
    const s = src as any;
    const { data, error } = await supabase.rpc('engine_rule_save' as any, {
      _payload: {
        name: `${s.name} (copy)`, description: s.description, rule_type: s.rule_type,
        module: s.module, sub_module: s.sub_module, tags: s.tags, severity: s.severity,
        conditions: s.conditions, actions: s.actions, suppression_days: s.suppression_days,
        intent: 'draft',
      } as any,
    });
    if (error) return toast.error(error.message);
    const failed = rpcErrors(data);
    if (failed) return toast.error(failed);
    toast.success('Rule cloned as draft');
    load();
  };


  const exportCsv = async () => {
    try {
      await authorizedExport('rule_engine', 'export', { count: rows.length, family });
    } catch (e: any) {
      return toast.error(e.message || 'Export not permitted');
    }
    const blob = new Blob([inventoryCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rule-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openRule = (r: InventoryRule) => {
    if (r.capabilities?.edit_central) navigate(`/admin/rule-engine/${r.rule_id}`);
    else if (r.source_screen) navigate(r.source_screen);
    else toast.info('This rule family has no editor screen.');
  };

  const kpiCards = [
    { label: 'Total rules', value: kpis?.total ?? 0 },
    { label: 'Active', value: kpis?.active ?? 0 },
    { label: 'Draft', value: kpis?.draft ?? 0 },
    { label: 'Inactive', value: kpis?.inactive ?? 0 },
    { label: 'Never executed', value: kpis?.never_executed ?? 0 },
    { label: 'Never tested', value: kpis?.never_tested ?? 0 },
    { label: 'Tests older than 90d', value: kpis?.stale_tests ?? 0 },
    { label: 'Failing (30d)', value: kpis?.failing ?? 0 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Rule Engine — Rule Library"
          description="Unified oversight of every supervisory rule across the platform. Module families keep their own editors and runtime owners; this library governs inventory, status, testing and execution evidence."
          actions={
            <div className="flex gap-2">
              <Button data-rbac="rule_engine.export" variant="outline" onClick={exportCsv} disabled={!rows.length}>
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
              <Button data-rbac="rule_engine.edit" onClick={() => navigate('/admin/rule-engine/new')}>
                <Plus className="h-4 w-4 mr-2" /> New Rule
              </Button>
            </div>
          }
        />

        <div className="grid gap-3 md:grid-cols-4">
          {kpiCards.map((k) => (
            <Card key={k.label}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="text-2xl font-semibold font-mono">{k.value}</div>
            </CardContent></Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <Tabs value={family} onValueChange={setFamily}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all">All rules ({kpis?.total ?? 0})</TabsTrigger>
                {families.map((f) => (
                  <TabsTrigger key={f.key} value={f.key}>{f.label} ({f.count})</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="grid gap-3 md:grid-cols-4">
              <Input placeholder="Search code, name, module, tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue placeholder="Rule type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {(facets.rule_types.length
                    ? facets.rule_types.map((v) => ({ value: v, label: typeLabel(v) }))
                    : RULE_TYPES.map((t) => ({ value: t.value, label: t.label }))
                  ).map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
                  {(facets.severities.length ? facets.severities : ['low', 'medium', 'high', 'critical'])
                    .map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {facets.modules.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">{m.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={subModuleFilter} onValueChange={setSubModuleFilter}>
                <SelectTrigger><SelectValue placeholder="Sub-module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sub-modules</SelectItem>
                  {facets.sub_modules.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">{m.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger><SelectValue placeholder="Tag" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {facets.tags.length === 0 && <SelectItem value="__none" disabled>No tags in use</SelectItem>}
                  {facets.tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <Label className="text-[11px] text-muted-foreground">Triggered from</Label>
                  <Input type="date" value={triggeredFrom} onChange={(e) => setTriggeredFrom(e.target.value)} />
                </div>
                <div className="flex-1">
                  <Label className="text-[11px] text-muted-foreground">to</Label>
                  <Input type="date" value={triggeredTo} onChange={(e) => setTriggeredTo(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={resetFilters}>Reset filters</Button>
            </div>


            {loading ? (
              <div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No rules match these filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('rule_code')}>Rule Code</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('name')}>Rule</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('family')}>Family</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('rule_type')}>Type</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('module')}>Module</TableHead>
                    <TableHead>Sub module</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('severity')}>Severity</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('status')}>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('trigger_count')}>Fires</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('last_triggered_at')}>Last triggered</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('last_tested_at')}>Last tested</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Runtime owner</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('last_modified_at')}>Last modified</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={`${r.family}-${r.rule_id}`} className="cursor-pointer" onClick={() => openRule(r)}>
                        <TableCell className="font-mono text-xs">{r.rule_code}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{r.description || '—'}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.family_label}
                          {!r.capabilities?.edit_central && (
                            <div className="text-[11px] text-muted-foreground">Managed in module</div>
                          )}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{typeLabel(r.rule_type)}</Badge></TableCell>
                        <TableCell className="text-xs capitalize">{r.module?.replace(/_/g, ' ') || '—'}</TableCell>
                        <TableCell className="text-xs capitalize">{r.sub_module?.replace(/_/g, ' ') || '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{r.severity || '—'}</Badge></TableCell>
                        <TableCell><Badge variant={statusVariant(r.status) as any} className="capitalize">{r.status}</Badge></TableCell>
                        <TableCell className="text-xs font-mono">
                          {r.capabilities?.versions
                            ? <>v{r.version ?? '—'}<div className="text-[11px] text-muted-foreground">active v{r.active_version ?? '—'}</div></>
                            : <span className="text-muted-foreground">n/a</span>}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{r.trigger_count ?? 0}</TableCell>
                        <TableCell className="text-xs font-mono">{fmtDate(r.last_triggered_at)}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {r.capabilities?.test ? fmtDate(r.last_tested_at) : <span className="text-muted-foreground">n/a</span>}
                        </TableCell>
                        <TableCell className="text-xs">{r.owner_name || '—'}</TableCell>
                        <TableCell className="text-[11px] font-mono">{r.runtime_owner || '—'}</TableCell>
                        <TableCell className="text-xs">
                          <div>{fmtDate(r.last_modified_at)}</div>
                          <div className="text-[11px] text-muted-foreground">{r.modified_by_name || '—'}</div>
                          {r.source_screen && (
                            <div className="text-[11px] text-muted-foreground">{r.source_screen}</div>
                          )}
                        </TableCell>

                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {r.capabilities?.test && r.capabilities?.edit_central && (
                              <Button data-rbac="rule_engine.test" size="sm" variant="ghost" title="Test"
                                onClick={() => navigate(`/admin/rule-engine/${r.rule_id}?tab=test`)}>
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {r.capabilities?.test && !r.capabilities?.edit_central && isModuleFamily(r.family) && (
                              <Button data-rbac="rule_engine.test" size="sm" variant="ghost"
                                title={`${MODULE_TESTER_SPECS[r.family].label} (dry run)`}
                                onClick={() => navigate(`/admin/rule-engine/test/${r.family}/${r.rule_id}`)}>
                                <Play className="h-4 w-4" />
                              </Button>
                            )}

                            {r.capabilities?.executions && r.capabilities?.edit_central && (
                              <Button data-rbac="rule_engine.view_executions" size="sm" variant="ghost" title="Execution history"
                                onClick={() => navigate(`/admin/rule-engine/${r.rule_id}?tab=history`)}>
                                <History className="h-4 w-4" />
                              </Button>
                            )}
                            {r.capabilities?.clone && (
                              <Button data-rbac="rule_engine.edit" size="sm" variant="ghost" onClick={() => clone(r)} title="Clone">
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                            {r.capabilities?.activate && (
                              r.status === 'active' ? (
                                <Button data-rbac="rule_engine.activate" size="sm" variant="ghost" onClick={() => setDeactivating(r)} title="Deactivate">
                                  <PauseCircle className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button data-rbac="rule_engine.activate" size="sm" variant="ghost" disabled={busy} onClick={() => activate(r)} title="Activate">
                                  <PlayCircle className="h-4 w-4" />
                                </Button>
                              )
                            )}
                            {!r.capabilities?.edit_central && r.source_screen && (
                              <Button size="sm" variant="ghost" title="Open module editor" onClick={() => navigate(r.source_screen!)}>
                                <ExternalLink className="h-4 w-4" />
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

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {total === 0 ? 'No rules' : `Showing ${page * PAGE_SIZE + 1}–${Math.min(total, (page + 1) * PAGE_SIZE)} of ${total}`}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Runtime ownership</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {families.map((f) => {
              const sample = rows.find((r) => r.family === f.key);
              return (
                <div key={f.key} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{f.label}</span>
                    <Badge variant="outline">{f.count}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Evaluated by: {sample?.runtime_owner || '—'}
                  </p>
                  {sample?.source_screen && (
                    <Button size="sm" variant="ghost" className="px-0 mt-1 h-auto text-xs"
                      onClick={() => navigate(sample.source_screen!)}>
                      Open module configuration <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!deactivating} onOpenChange={(o) => { if (!o) { setDeactivating(null); setJustification(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deactivate {deactivating?.rule_code}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Deactivation stops future firing. Alerts already open stay open and must be closed on their own merits.
            </p>
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
