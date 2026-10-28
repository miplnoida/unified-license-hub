import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Eye, Trash2, FileBarChart, RefreshCw, Search, FileSpreadsheet, FileJson, FileDown, FileText } from 'lucide-react';
import { useReports } from '../hooks/useReports';
import type { ReportRun } from '../types';
import { exportToCsv, exportToJson, exportToPdf, exportToXlsx, sanitizeFilename } from '../services/exportService';
import { buildReportProvenance } from '../lib/reportProvenance';
import { logExport as logExportRegistry } from '@/lib/exportAudit';
import { fetchRunRows, generateReport, logExport } from '../services/reportService';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import { useToast } from '@/hooks/use-toast';
import { useReportOptions } from '../hooks/useReportMetadata';

interface Props { onPreview: (run: ReportRun) => void; }

export function ReportHistory({ onPreview }: Props) {
  const { toast } = useToast();
  const { data, isLoading, remove, invalidate } = useReports();
  const { data: statusOpts = [] } = useReportOptions('report_run_status');
  const { data: exportOpts = [] } = useReportOptions('export_format');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rerunId, setRerunId] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set((data || []).map((r) => r.category))), [data]);

  const downloadableFormats = useMemo(
    () => exportOpts.filter((o) => ['csv', 'xlsx', 'json', 'pdf'].includes(o.value)),
    [exportOpts],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (category !== 'all' && r.category !== category) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, search, status, category]);

  const loadFullRun = async (run: ReportRun): Promise<ReportRun> => {
    const rows = run.rows && run.rows.length >= run.rowCount ? run.rows : await fetchRunRows(run.id);
    return { ...run, rows: rows.length ? rows : run.rows };
  };

  const handleView = async (run: ReportRun) => {
    const full = await loadFullRun(run);
    onPreview(full);
  };

  const handleRerun = async (run: ReportRun) => {
    if (!run.source) {
      toast({ title: 'Cannot re-run', description: 'Source not available on legacy reports.', variant: 'destructive' });
      return;
    }
    setRerunId(run.id);
    try {
      const next = await generateReport({
        name: run.name, category: run.category, source: run.source, filters: run.filters,
        reportSlug: run.slug, selectedColumns: run.selectedColumns, groupBy: run.groupBy,
        sortBy: run.sortBy, sortDir: run.sortDir,
      });
      toast({ title: 'Re-run complete', description: `${next.rowCount} rows.` });
      invalidate();
      onPreview(next);
    } catch (e: any) {
      toast({ title: 'Re-run failed', description: e?.message, variant: 'destructive' });
    } finally { setRerunId(null); }
  };

  const handleExport = async (run: ReportRun, fmt: 'csv' | 'xlsx' | 'json' | 'pdf') => {
    try {
      await authorizedExport('report_management', 'export', { run_id: run.id, fmt, rows: run.rowCount });
    } catch (e: any) {
      toast({ title: 'Not authorized', description: e?.message || 'You lack permission to export reports.', variant: 'destructive' });
      return;
    }
    const full = await loadFullRun(run);
    const fname = sanitizeFilename(run.name);
    const provenance = await buildReportProvenance(full);
    if (fmt === 'csv') exportToCsv(full.rows, fname, undefined, provenance);
    else if (fmt === 'xlsx') exportToXlsx(full.rows, fname, undefined, provenance);
    else if (fmt === 'pdf') await exportToPdf(full.rows, fname, run.name, undefined, provenance);
    else exportToJson(full.rows, fname, provenance);
    await logExportRegistry({
      dataset: (run.source as string) || 'report_runs',
      format: fmt,
      rowCount: full.rowCount,
      filters: { ...(run.filters || {}), report: run.name, as_of: provenance.asOfPeriod },
      moduleKey: 'report_management',
      justification: `Governed report export from history: ${run.name} (${fmt.toUpperCase()})`,
      payload: JSON.stringify({ provenance, rowCount: full.rowCount }),
    });
    const logged = await logExport(run.id, fmt, run.rowCount);
    if (!logged) {
      toast({ title: 'Export completed', description: 'The file downloaded, but the audit log entry failed to record.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search history..." className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statusOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <FileBarChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No reports yet. Generate one from the Library or Ad-Hoc Builder.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                      <FileBarChart className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{r.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.category} · {r.rowCount} rows · {new Date(r.generatedAt).toLocaleString()}
                        {r.durationMs != null && ` · ${r.durationMs}ms`}
                      </p>
                      {r.errorMessage && <p className="text-xs text-destructive truncate">{r.errorMessage}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={r.status === 'ready' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'} className="capitalize">{r.status}</Badge>
                    <Button size="sm" variant="outline" onClick={() => handleView(r)}><Eye className="h-3 w-3 mr-1" />View</Button>
                    {downloadableFormats.map((f) => (
                      <Button key={f.value} size="sm" variant="outline" onClick={() => handleExport(r, f.value as any)}>
                        {f.value === 'csv' && <FileSpreadsheet className="h-3 w-3 mr-1" />}
                        {f.value === 'xlsx' && <FileDown className="h-3 w-3 mr-1" />}
                        {f.value === 'json' && <FileJson className="h-3 w-3 mr-1" />}
                        {f.value === 'pdf' && <FileText className="h-3 w-3 mr-1" />}
                        {f.value.toUpperCase()}
                      </Button>
                    ))}
                    <Button data-rbac="report_management.create" size="sm" variant="outline" disabled={rerunId === r.id} onClick={() => handleRerun(r)}>
                      <RefreshCw className={`h-3 w-3 mr-1 ${rerunId === r.id ? 'animate-spin' : ''}`} />Re-run
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(r.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmId) remove.mutate(confirmId, {
                onSuccess: () => toast({ title: 'Deleted' }),
                onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
              });
              setConfirmId(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
