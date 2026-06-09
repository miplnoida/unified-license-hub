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
import {
  useReportSources, useReportFilters, useReportOptions, useReportSourceColumns,
} from '../hooks/useReportMetadata';
import { DynamicReportFilters } from './filters/DynamicReportFilters';
import { BasicFallbackFilters } from './filters/BasicFallbackFilters';
import { groupColumns, GROUP_LABELS, humanizeKey, type ColumnGroup } from '../lib/columnLabels';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

const DEFAULT: BuilderConfig = {
  name: '',
  description: '',
  source: 'applications',
  filters: { preset: 'this_month' },
  columns: [],
  sortDir: 'asc',
};

function formatShortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildDefaultReportName(config: BuilderConfig, sourceLabel?: string): string {
  const source = sourceLabel || config.source;
  const preset = config.filters.preset;
  let suffix = '';
  if (preset && preset !== 'custom') {
    const map: Record<string, string> = {
      today: 'Today',
      this_week: 'This Week',
      this_month: 'This Month',
      this_quarter: 'This Quarter',
      this_fy: 'This Financial Year',
    };
    suffix = map[preset] || preset;
  } else if (config.filters.dateFrom && config.filters.dateTo) {
    const from = formatShortDate(config.filters.dateFrom);
    const to = formatShortDate(config.filters.dateTo);
    suffix = from === to ? from : `${from} - ${to}`;
  } else if (config.filters.dateFrom) {
    suffix = formatShortDate(config.filters.dateFrom);
  } else if (config.filters.dateTo) {
    suffix = formatShortDate(config.filters.dateTo);
  } else {
    suffix = 'Custom Range';
  }
  return `${source} Report - ${suffix}`;
}

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

  // Metadata-driven option lists
  const { data: sources = [] } = useReportSources();
  const { data: filterMeta = [] } = useReportFilters(cfg.source);
  const { data: sortDirs = [] } = useReportOptions('sort_direction');

  const refreshTemplates = () => listTemplates().then(setTemplates).catch(() => setTemplates([]));
  useEffect(() => { refreshTemplates(); }, []);

  const update = (patch: Partial<BuilderConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const updateFilter = (patch: Record<string, any>) => setCfg((c) => ({ ...c, filters: { ...c.filters, ...patch } }));

  const handlePreview = async () => {
    setBusy('preview');
    try {
      const { rows, count } = await previewReport(cfg.source, cfg.filters, 100, {
        selectedColumns: cfg.columns, groupBy: cfg.groupBy, sortBy: cfg.sortBy, sortDir: cfg.sortDir,
      });
      const previewName = cfg.name?.trim() || buildDefaultReportName(cfg, activeSource?.label);
      onPreview({
        id: 'preview',
        name: previewName,
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
    setBusy('generate');
    try {
      const finalConfig = {
        ...cfg,
        name: cfg.name?.trim() || buildDefaultReportName(cfg, activeSource?.label),
      };
      const run = await generateFromBuilder(finalConfig);
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

  // Prefer columns from source metadata (safe_columns); fallback to static map
  const activeSource = sources.find((s) => s.sourceKey === cfg.source);
  const columnOpts = activeSource?.safeColumns?.length
    ? activeSource.safeColumns
    : (COLUMN_OPTIONS_BY_SOURCE[cfg.source] || []);
  const hasMetadataFilters = (filterMeta || []).some((m) => m.isActive);

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
              <Label>Report Name (optional)</Label>
              <Input value={cfg.name} onChange={(e) => update({ name: e.target.value })} placeholder="Auto-generated if left blank" />
            </div>
            <div className="space-y-2">
              <Label>Dataset</Label>
              <Select value={cfg.source} onValueChange={(v) => update({ source: v as ReportSource, columns: [], filters: { preset: 'this_month' } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sources.filter((s) => s.supportsAdHoc).map((s) => <SelectItem key={s.sourceKey} value={s.sourceKey}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={cfg.description} onChange={(e) => update({ description: e.target.value })} rows={2} />
          </div>

          {hasMetadataFilters ? (
            <DynamicReportFilters
              sourceKey={cfg.source}
              filters={cfg.filters}
              onChange={(patch) => updateFilter(patch)}
            />
          ) : (
            <BasicFallbackFilters source={cfg.source} filters={cfg.filters} onChange={(patch) => updateFilter(patch)} />
          )}



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
                  {sortDirs.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
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
