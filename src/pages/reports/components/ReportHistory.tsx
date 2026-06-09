import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Eye, Trash2, FileBarChart, RefreshCw, Search, FileSpreadsheet, FileJson, FileDown } from 'lucide-react';
import { useReports } from '../hooks/useReports';
import type { ReportRun } from '../types';
import { exportToCsv, exportToJson, exportToXlsx, sanitizeFilename } from '../services/exportService';
import { generateReport, logExport } from '../services/reportService';
import { useToast } from '@/hooks/use-toast';

interface Props { onPreview: (run: ReportRun) => void; }

export function ReportHistory({ onPreview }: Props) {
  const { toast } = useToast();
  const { data, isLoading, remove, invalidate } = useReports();
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rerunId, setRerunId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return q ? data.filter((r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)) : data;
  }, [data, search]);

  const handleRerun = async (run: ReportRun) => {
    if (!run.source) {
      toast({ title: 'Cannot re-run', description: 'Source not available on legacy reports.', variant: 'destructive' });
      return;
    }
    setRerunId(run.id);
    try {
      const next = await generateReport({
        name: run.name, category: run.category, source: run.source, filters: run.filters,
      });
      toast({ title: 'Re-run complete', description: `${next.rowCount} rows.` });
      invalidate();
      onPreview(next);
    } catch (e: any) {
      toast({ title: 'Re-run failed', description: e?.message, variant: 'destructive' });
    } finally { setRerunId(null); }
  };

  const handleExport = (run: ReportRun, fmt: 'csv' | 'xlsx' | 'json') => {
    const fname = sanitizeFilename(run.name);
    if (fmt === 'csv') exportToCsv(run.rows, fname);
    else if (fmt === 'xlsx') exportToXlsx(run.rows, fname);
    else exportToJson(run.rows, fname);
    logExport(run.id, fmt, run.rowCount);
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search history..." className="pl-9" />
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
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={r.status === 'ready' ? 'default' : 'secondary'} className="capitalize">{r.status}</Badge>
                    <Button size="sm" variant="outline" onClick={() => onPreview(r)}><Eye className="h-3 w-3 mr-1" />View</Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport(r, 'csv')}><FileSpreadsheet className="h-3 w-3 mr-1" />CSV</Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport(r, 'xlsx')}><FileDown className="h-3 w-3 mr-1" />XLSX</Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport(r, 'json')}><FileJson className="h-3 w-3 mr-1" />JSON</Button>
                    <Button size="sm" variant="outline" disabled={rerunId === r.id} onClick={() => handleRerun(r)}>
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
