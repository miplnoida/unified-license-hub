import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Eye, Save, RefreshCw } from 'lucide-react';
import { COLUMN_OPTIONS_BY_SOURCE } from '../reportDefinitions';
import type { BuilderConfig, ReportRun, ReportSource } from '../types';
import { generateFromBuilder, previewReport } from '../services/reportService';
import { useToast } from '@/hooks/use-toast';

const SOURCES: { value: ReportSource; label: string }[] = [
  { value: 'applications', label: 'Applications' },
  { value: 'licenses', label: 'Licenses' },
  { value: 'payments', label: 'Payments' },
  { value: 'compliance_returns', label: 'Compliance Returns' },
  { value: 'complaints', label: 'Complaints' },
  { value: 'users', label: 'Users' },
  { value: 'audit_logs', label: 'Audit Logs' },
];

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_fy', label: 'This Financial Year' },
  { value: 'custom', label: 'Custom' },
];

const DEFAULT: BuilderConfig = {
  name: '',
  description: '',
  source: 'applications',
  filters: { preset: 'this_month' },
  columns: [],
};

interface Props {
  onPreview: (run: ReportRun) => void;
}

export function AdHocReportBuilder({ onPreview }: Props) {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<BuilderConfig>(DEFAULT);
  const [busy, setBusy] = useState<'preview' | 'generate' | null>(null);

  const update = (patch: Partial<BuilderConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const updateFilter = (patch: Record<string, string>) => setCfg((c) => ({ ...c, filters: { ...c.filters, ...patch } }));

  const handlePreview = async () => {
    setBusy('preview');
    try {
      const { rows, count } = await previewReport(cfg.source, cfg.filters, 100);
      onPreview({
        id: 'preview',
        name: cfg.name || `Preview · ${cfg.source}`,
        category: 'Ad-Hoc',
        source: cfg.source,
        filters: cfg.filters,
        rows,
        rowCount: count,
        generatedAt: new Date().toISOString(),
        status: 'ready',
      });
    } catch (e: any) {
      toast({ title: 'Preview failed', description: e?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const handleGenerate = async () => {
    if (!cfg.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setBusy('generate');
    try {
      const run = await generateFromBuilder(cfg);
      toast({ title: 'Report saved', description: `${run.rowCount} rows.` });
      onPreview(run);
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const columnOpts = COLUMN_OPTIONS_BY_SOURCE[cfg.source] || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Ad-Hoc Report Builder</CardTitle>
        <CardDescription>Build a custom report from any dataset and preview before saving.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Report Name *</Label>
            <Input value={cfg.name} onChange={(e) => update({ name: e.target.value })} placeholder="My Custom Report" />
          </div>
          <div className="space-y-2">
            <Label>Dataset</Label>
            <Select value={cfg.source} onValueChange={(v) => update({ source: v as ReportSource, columns: [] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={cfg.description} onChange={(e) => update({ description: e.target.value })} rows={2} />
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Date Preset</Label>
            <Select value={cfg.filters.preset || 'custom'} onValueChange={(v) => updateFilter({ preset: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={cfg.filters.dateFrom || ''} onChange={(e) => updateFilter({ dateFrom: e.target.value, preset: 'custom' })} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={cfg.filters.dateTo || ''} onChange={(e) => updateFilter({ dateTo: e.target.value, preset: 'custom' })} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Input value={cfg.filters.status || ''} onChange={(e) => updateFilter({ status: e.target.value })} placeholder="any" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Columns ({cfg.columns.length || 'all'})</Label>
          <div className="flex flex-wrap gap-2">
            {columnOpts.map((c) => {
              const on = cfg.columns.includes(c);
              return (
                <Button key={c} type="button" size="sm" variant={on ? 'default' : 'outline'}
                  onClick={() => update({ columns: on ? cfg.columns.filter((x) => x !== c) : [...cfg.columns, c] })}>
                  {c}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Group By</Label>
            <Select value={cfg.groupBy || 'none'} onValueChange={(v) => update({ groupBy: v === 'none' ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {columnOpts.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sort By</Label>
            <Select value={cfg.sortBy || 'none'} onValueChange={(v) => update({ sortBy: v === 'none' ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {columnOpts.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setCfg(DEFAULT)}><RefreshCw className="h-4 w-4 mr-2" />Reset</Button>
          <Button variant="outline" onClick={handlePreview} disabled={busy !== null}>
            <Eye className="h-4 w-4 mr-2" />{busy === 'preview' ? 'Loading…' : 'Preview'}
          </Button>
          <Button variant="outline" disabled title="Saved templates coming soon"><Save className="h-4 w-4 mr-2" />Save Template</Button>
          <Button onClick={handleGenerate} disabled={busy !== null}>
            <Play className="h-4 w-4 mr-2" />{busy === 'generate' ? 'Generating…' : 'Generate Report'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
