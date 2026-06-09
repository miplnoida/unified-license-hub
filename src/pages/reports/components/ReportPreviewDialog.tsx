import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { FileSpreadsheet, FileText, FileJson, FileDown, ExternalLink, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReportRun, ReportSource } from '../types';
import { exportToCsv, exportToJson, exportToXlsx, sanitizeFilename, safeRows } from '../services/exportService';
import { logExport } from '../services/reportService';
import { useToast } from '@/hooks/use-toast';

interface Props {
  run: ReportRun | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const PAGE_SIZE = 20;

function sourceRoute(source: ReportSource | undefined, id: unknown): string | null {
  if (!id || typeof id !== 'string') return null;
  switch (source) {
    case 'applications': return `/applications/${id}`;
    case 'licenses': return `/licenses/${id}`;
    case 'complaints': return `/complaints`;
    case 'compliance_returns': return `/returns-management/${id}`;
    default: return null;
  }
}

export function ReportPreviewDialog({ run, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const rows = useMemo(() => (run ? safeRows(run.rows) : []), [run]);
  const headers = useMemo(() => {
    const set = new Set<string>();
    rows.slice(0, 50).forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (!run) return null;
  const fname = sanitizeFilename(run.name);
  const filterEntries = Object.entries(run.filters || {}).filter(([, v]) => v != null && v !== '');
  const summary = run.summary || {};
  const groupSummary = (summary as any).groups as Record<string, number> | undefined;

  const handleExport = (fmt: 'csv' | 'xlsx' | 'json') => {
    if (fmt === 'csv') exportToCsv(run.rows, fname);
    else if (fmt === 'xlsx') exportToXlsx(run.rows, fname);
    else exportToJson(run.rows, fname);
    logExport(run.id, fmt, run.rowCount);
    toast({ title: 'Export ready', description: `${run.name}.${fmt} downloaded.` });
  };

  const handlePrint = () => {
    logExport(run.id, 'pdf', run.rowCount);
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl print:max-w-full print:shadow-none">
        <DialogHeader>
          <DialogTitle>{run.name}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{run.category}</Badge>
            {run.source && <Badge variant="outline">{run.source}</Badge>}
            <span>Generated: {new Date(run.generatedAt).toLocaleString()}</span>
            <span>·</span>
            <span>{run.rowCount} rows</span>
            {run.durationMs != null && <span>· {run.durationMs}ms</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 print:space-y-2" id="report-preview-printable">
          {(filterEntries.length > 0 || (run.selectedColumns && run.selectedColumns.length > 0) || run.groupBy || run.sortBy) && (
            <Card>
              <CardContent className="py-3 text-xs space-y-2">
                {filterEntries.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-muted-foreground">Filters:</span>
                    {filterEntries.map(([k, v]) => (
                      <Badge key={k} variant="outline">{k}: {String(v)}</Badge>
                    ))}
                  </div>
                )}
                {run.selectedColumns && run.selectedColumns.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-muted-foreground">Columns:</span>
                    {run.selectedColumns.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
                  </div>
                )}
                {(run.groupBy || run.sortBy) && (
                  <div className="flex flex-wrap gap-2">
                    {run.groupBy && <Badge variant="outline">Group by: {run.groupBy}</Badge>}
                    {run.sortBy && <Badge variant="outline">Sort: {run.sortBy} {run.sortDir || 'asc'}</Badge>}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {groupSummary && Object.keys(groupSummary).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(groupSummary).slice(0, 8).map(([k, v]) => (
                <Card key={k}>
                  <CardContent className="py-3">
                    <p className="text-xs text-muted-foreground truncate">{k}</p>
                    <p className="text-xl font-semibold">{v}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 print:hidden">
            <Button size="sm" variant="outline" onClick={() => handleExport('csv')}><FileSpreadsheet className="h-3 w-3 mr-1" />CSV</Button>
            <Button size="sm" variant="outline" onClick={() => handleExport('xlsx')}><FileDown className="h-3 w-3 mr-1" />XLSX</Button>
            <Button size="sm" variant="outline" onClick={() => handleExport('json')}><FileJson className="h-3 w-3 mr-1" />JSON</Button>
            <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-3 w-3 mr-1" />Print / PDF</Button>
          </div>

          <div className="border rounded-md max-h-[50vh] overflow-auto print:max-h-none print:overflow-visible">
            {rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No data in this report.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>)}
                    <TableHead className="text-xs print:hidden">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r, i) => {
                    const route = sourceRoute(run.source, r.id);
                    return (
                      <TableRow key={i}>
                        {headers.map((h) => (
                          <TableCell key={h} className="whitespace-nowrap text-xs max-w-[260px] truncate">
                            {r[h] == null ? '' : typeof r[h] === 'object' ? JSON.stringify(r[h]) : String(r[h])}
                          </TableCell>
                        ))}
                        <TableCell className="text-xs print:hidden">
                          {route ? (
                            <Link to={route} className="text-primary inline-flex items-center gap-1 hover:underline">
                              <ExternalLink className="h-3 w-3" />Open
                            </Link>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {rows.length > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-2 text-xs print:hidden">
              <span className="text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next</Button>
            </div>
          )}

          <div className="hidden print:block text-[10px] text-muted-foreground pt-4 border-t">
            Unified License Hub · Confidential · Generated {new Date(run.generatedAt).toLocaleString()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
