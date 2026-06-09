import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Play, Eye, Save, RefreshCw, BookmarkPlus, Trash2 } from 'lucide-react';
import { COLUMN_OPTIONS_BY_SOURCE } from '../reportDefinitions';
import type { BuilderConfig, ReportRun, ReportSource, ReportTemplate, SortDirection } from '../types';
import {
  deleteTemplate, generateFromBuilder, listTemplates, previewReport, saveTemplate,
} from '../services/reportService';
import { useToast } from '@/hooks/use-toast';
import { useAllRegulators } from '@/hooks/useRegulators';
import { useSectors, useSubSectors, useServices } from '@/hooks/useMasterConfig';

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

const STATUS_OPTIONS_BY_SOURCE: Partial<Record<ReportSource, string[]>> = {
  applications: ['draft', 'submitted', 'in_review', 'approved', 'rejected', 'pending'],
  licenses: ['active', 'expired', 'suspended', 'revoked', 'pending'],
  payments: ['pending', 'completed', 'paid', 'failed', 'refunded'],
  compliance_returns: ['pending', 'submitted', 'validated', 'rejected', 'tbr'],
  complaints: ['open', 'in_review', 'escalated', 'resolved', 'closed', 'dismissed'],
};

const DEFAULT: BuilderConfig = {
  name: '',
  description: '',
  source: 'applications',
  filters: { preset: 'this_month' },
  columns: [],
  sortDir: 'asc',
};

interface Props {
  onPreview: (run: ReportRun) => void;
}

export function AdHocReportBuilder({ onPreview }: Props) {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<BuilderConfig>(DEFAULT);
  const [busy, setBusy] = useState<'preview' | 'generate' | null>(null);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const regulatorsQ = useAllRegulators();
  const sectorsQ = useSectors(cfg.filters.regulator || null);
  const subSectorsQ = useSubSectors(cfg.filters.regulator || null);
  const servicesQ = useServices(cfg.filters.regulator || null);

  const refreshTemplates = () => listTemplates().then(setTemplates).catch(() => setTemplates([]));
  useEffect(() => { refreshTemplates(); }, []);

  const update = (patch: Partial<BuilderConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const updateFilter = (patch: Record<string, string>) => setCfg((c) => ({ ...c, filters: { ...c.filters, ...patch } }));

  const handlePreview = async () => {
    setBusy('preview');
    try {
      const { rows, count } = await previewReport(cfg.source, cfg.filters, 100, {
        selectedColumns: cfg.columns, groupBy: cfg.groupBy, sortBy: cfg.sortBy, sortDir: cfg.sortDir,
      });
      onPreview({
        id: 'preview',
        name: cfg.name || `Preview · ${cfg.source}`,
        category: 'Ad-Hoc',
        source: cfg.source,
        filters: cfg.filters,
        selectedColumns: cfg.columns,
        groupBy: cfg.groupBy,
        sortBy: cfg.sortBy,
        sortDir: cfg.sortDir,
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

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast({ title: 'Template name required', variant: 'destructive' });
      return;
    }
    try {
      await saveTemplate({
        name: templateName,
        description: cfg.description,
        source: cfg.source,
        filters: cfg.filters,
        selectedColumns: cfg.columns,
        groupBy: cfg.groupBy,
        sortBy: cfg.sortBy,
        sortDir: cfg.sortDir,
        visibility: 'private',
      });
      toast({ title: 'Template saved' });
      setTemplateDialog(false);
      setTemplateName('');
      refreshTemplates();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    }
  };

  const loadTemplate = (t: ReportTemplate) => {
    setCfg({
      name: t.name,
      description: t.description || '',
      source: t.source,
      filters: t.filters,
      columns: t.selectedColumns,
      groupBy: t.groupBy,
      sortBy: t.sortBy,
      sortDir: t.sortDir || 'asc',
    });
    toast({ title: `Loaded "${t.name}"` });
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplate(id);
      toast({ title: 'Template deleted' });
      refreshTemplates();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message, variant: 'destructive' });
    }
  };

  const columnOpts = COLUMN_OPTIONS_BY_SOURCE[cfg.source] || [];
  const statusOpts = STATUS_OPTIONS_BY_SOURCE[cfg.source] || [];

  return (
    <div className="space-y-6">
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
              {statusOpts.length ? (
                <Select value={cfg.filters.status || 'all'} onValueChange={(v) => updateFilter({ status: v === 'all' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    {statusOpts.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={cfg.filters.status || ''} onChange={(e) => updateFilter({ status: e.target.value })} placeholder="any" />
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Regulator</Label>
              <Select value={cfg.filters.regulator || 'all'} onValueChange={(v) => updateFilter({ regulator: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  {(regulatorsQ.data || []).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sector</Label>
              <Select value={cfg.filters.sector || 'all'} onValueChange={(v) => updateFilter({ sector: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  {(sectorsQ.data || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub-Sector</Label>
              <Select value={cfg.filters.subSector || 'all'} onValueChange={(v) => updateFilter({ subSector: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  {(subSectorsQ.data || []).filter((s: any) => !cfg.filters.sector || s.sector_id === cfg.filters.sector).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Service</Label>
              <Select value={cfg.filters.service || 'all'} onValueChange={(v) => updateFilter({ service: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  {(servicesQ.data || []).filter((s: any) => !cfg.filters.sector || s.sector_id === cfg.filters.sector).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Risk Level</Label>
              <Select value={cfg.filters.riskLevel || 'all'} onValueChange={(v) => updateFilter({ riskLevel: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Licensee ID</Label>
              <Input value={cfg.filters.licensee || ''} onChange={(e) => updateFilter({ licensee: e.target.value })} placeholder="optional" />
            </div>
            <div className="space-y-2">
              <Label>Officer ID</Label>
              <Input value={cfg.filters.officer || ''} onChange={(e) => updateFilter({ officer: e.target.value })} placeholder="optional" />
            </div>
            <div className="space-y-2">
              <Label>SLA Status</Label>
              <Select value={cfg.filters.slaStatus || 'all'} onValueChange={(v) => updateFilter({ slaStatus: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="on_track">On track</SelectItem>
                  <SelectItem value="at_risk">At risk</SelectItem>
                  <SelectItem value="breached">Breached</SelectItem>
                </SelectContent>
              </Select>
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

          <div className="grid md:grid-cols-3 gap-4">
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
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={cfg.sortDir || 'asc'} onValueChange={(v) => update({ sortDir: v as SortDirection })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setCfg(DEFAULT)}><RefreshCw className="h-4 w-4 mr-2" />Reset</Button>
            <Button variant="outline" onClick={handlePreview} disabled={busy !== null}>
              <Eye className="h-4 w-4 mr-2" />{busy === 'preview' ? 'Loading…' : 'Preview'}
            </Button>
            <Button variant="outline" onClick={() => setTemplateDialog(true)}>
              <Save className="h-4 w-4 mr-2" />Save Template
            </Button>
            <Button onClick={handleGenerate} disabled={busy !== null}>
              <Play className="h-4 w-4 mr-2" />{busy === 'generate' ? 'Generating…' : 'Generate Report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved Templates</CardTitle>
          <CardDescription>Reuse builder configurations.</CardDescription>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved templates yet.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.source} · {t.visibility}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => loadTemplate(t)}>
                      <BookmarkPlus className="h-3 w-3 mr-1" />Load
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteTemplate(t.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Template</DialogTitle>
            <DialogDescription>Saves the current dataset, filters, columns, group and sort.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Template name</Label>
            <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Monthly Applications" />
            <Button className="w-full" onClick={handleSaveTemplate}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
