import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Download, Loader2, ShieldAlert } from 'lucide-react';
import { OVERRIDE_MODULES, type RuleOverrideRow } from '@/lib/ruleOverrides';
import { logExport } from '@/lib/complianceAudit';
import { DiffViewer } from '@/components/audit/DiffViewer';
import { ChangeHistoryDrawer } from '@/components/audit/ChangeHistoryDrawer';

const ALL = '__all__';

export default function RuleOverrides() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RuleOverrideRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [fModule, setFModule] = useState<string>(ALL);
  const [fEntity, setFEntity] = useState('');
  const [fEntityId, setFEntityId] = useState('');
  const [fRule, setFRule] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [selected, setSelected] = useState<RuleOverrideRow | null>(null);
  const [timelineFor, setTimelineFor] = useState<RuleOverrideRow | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let q = (supabase as any)
        .from('rule_overrides')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (fModule && fModule !== ALL) q = q.eq('module', fModule);
      if (fEntity.trim()) q = q.ilike('entity_type', `%${fEntity.trim()}%`);
      if (fEntityId.trim()) q = q.ilike('entity_id', `%${fEntityId.trim()}%`);
      if (fRule.trim()) q = q.ilike('rule_key', `%${fRule.trim()}%`);
      if (fFrom) q = q.gte('created_at', new Date(fFrom).toISOString());
      if (fTo) q = q.lte('created_at', new Date(new Date(fTo).getTime() + 86400000).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as RuleOverrideRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load overrides.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load();   }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const byModule: Record<string, number> = {};
    rows.forEach((r) => { byModule[r.module] = (byModule[r.module] ?? 0) + 1; });
    const uniqueRules = new Set(rows.map((r) => r.rule_key)).size;
    return { total, byModule, uniqueRules };
  }, [rows]);

  async function handleExport() {
    if (rows.length === 0) return;
    const header = ['timestamp','module','entity_type','entity_id','rule_key','user_id','user_role','reason','original_value','overridden_value'];
    const escape = (v: unknown) => {
      const s = v === null || v === undefined
        ? ''
        : typeof v === 'string' ? v : JSON.stringify(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = [
      header.join(','),
      ...rows.map((r) => [
        r.created_at, r.module, r.entity_type, r.entity_id, r.rule_key,
        r.user_id ?? '', r.user_role ?? '', r.reason,
        r.original_value, r.overridden_value,
      ].map(escape).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rule-overrides-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await logExport({
      object_type: 'rule_overrides',
      format: 'CSV',
      criteria: { module: fModule, entity_type: fEntity, entity_id: fEntityId, rule_key: fRule, from: fFrom, to: fTo },
      record_ids: rows.map((r) => r.id),
      record_count: rows.length,
    });
  }

  return (
    <DashboardLayout
      title="Rule Overrides"
      subtitle="Every system rule, AI recommendation, and validation override — with mandatory justification."
    >
      <PageHeader
        title="Rule Overrides"
        description="Browse, filter, review and export all overrides recorded across the platform."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total overrides</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.total}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Distinct rules</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.uniqueRules}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Modules covered</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{Object.keys(stats.byModule).length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Result set</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{loading ? '…' : rows.length}</CardContent></Card>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-sm">Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Module</Label>
              <Select value={fModule} onValueChange={setFModule}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All modules</SelectItem>
                  {OVERRIDE_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Entity type</Label>
              <Input value={fEntity} onChange={(e) => setFEntity(e.target.value)} placeholder="application, complaint…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Entity ID</Label>
              <Input value={fEntityId} onChange={(e) => setFEntityId(e.target.value)} placeholder="uuid or partial…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rule key</Label>
              <Input value={fRule} onChange={(e) => setFRule(e.target.value)} placeholder="sufficiency.blocking…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={load} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
              </Button>
              <Button variant="outline" onClick={handleExport} disabled={loading || rows.length === 0} title="Export CSV">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setSelected(r)}
                >
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{r.module}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">
                    <div>{r.entity_type}</div>
                    <div className="text-muted-foreground">{r.entity_id.slice(0, 12)}…</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.rule_key}</TableCell>
                  <TableCell className="text-xs">
                    <div>{r.user_role ?? '—'}</div>
                    <div className="text-muted-foreground font-mono">{r.user_id?.slice(0, 8) ?? '—'}</div>
                  </TableCell>
                  <TableCell className="text-xs max-w-[24rem] truncate">{r.reason}</TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No overrides match the current filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-warning" />
                  Override detail
                </SheetTitle>
                <SheetDescription>
                  <span className="font-mono text-xs">{selected.rule_key}</span> on {selected.entity_type}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-xs uppercase text-muted-foreground">Module</div><div>{selected.module}</div></div>
                  <div><div className="text-xs uppercase text-muted-foreground">Recorded</div><div>{new Date(selected.created_at).toLocaleString()}</div></div>
                  <div><div className="text-xs uppercase text-muted-foreground">Actor role</div><div>{selected.user_role ?? '—'}</div></div>
                  <div><div className="text-xs uppercase text-muted-foreground">Actor</div><div className="font-mono text-xs">{selected.user_id ?? '—'}</div></div>
                  <div className="col-span-2"><div className="text-xs uppercase text-muted-foreground">Entity id</div><div className="font-mono text-xs break-all">{selected.entity_id}</div></div>
                </div>

                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Reason</div>
                  <div className="rounded-md border border-border p-2 whitespace-pre-wrap">{selected.reason}</div>
                </div>

                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Before → After</div>
                  <DiffViewer before={selected.original_value} after={selected.overridden_value} />
                </div>

                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setTimelineFor(selected)}>
                    View full entity timeline
                  </Button>
                </div>

                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <div>
                    <div className="text-xs uppercase text-muted-foreground mb-1">Metadata</div>
                    <pre className="rounded-md border border-border p-2 text-xs whitespace-pre-wrap break-all">
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {timelineFor && (
        <ChangeHistoryDrawer
          open={!!timelineFor}
          onOpenChange={(o) => { if (!o) setTimelineFor(null); }}
          entityType={timelineFor.entity_type}
          entityId={timelineFor.entity_id}
          title={`Timeline — ${timelineFor.entity_type}`}
        />
      )}
    </DashboardLayout>
  );
}
