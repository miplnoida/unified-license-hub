import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { FileSpreadsheet, FileText, FileJson, FileDown } from 'lucide-react';
import type { ReportRun } from '../types';
import { exportToCsv, exportToJson, exportToXlsx, sanitizeFilename, safeRows } from '../services/exportService';
import { logExport } from '../services/reportService';
import { useToast } from '@/hooks/use-toast';

interface Props {
  run: ReportRun | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const PAGE_SIZE = 20;

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

  const handleExport = (fmt: 'csv' | 'xlsx' | 'json') => {
    if (fmt === 'csv') exportToCsv(run.rows, fname);
    else if (fmt === 'xlsx') exportToXlsx(run.rows, fname);
    else exportToJson(run.rows, fname);
    logExport(run.id, fmt, run.rowCount);
    toast({ title: 'Export ready', description: `${run.name}.${fmt} downloaded.` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{run.name}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{run.category}</Badge>
            <span>Generated: {new Date(run.generatedAt).toLocaleString()}</span>
            <span>·</span>
            <span>{run.rowCount} rows</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {Object.keys(run.filters || {}).length > 0 && (
            <Card>
              <CardContent className="py-3 text-xs flex flex-wrap gap-2">
                <span className="text-muted-foreground">Filters:</span>
                {Object.entries(run.filters).filter(([, v]) => v).map(([k, v]) => (
                  <Badge key={k} variant="outline">{k}: {String(v)}</Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => handleExport('csv')}>
              <FileSpreadsheet className="h-3 w-3 mr-1" />CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleExport('xlsx')}>
              <FileDown className="h-3 w-3 mr-1" />XLSX
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleExport('json')}>
              <FileJson className="h-3 w-3 mr-1" />JSON
            </Button>
            <Button size="sm" variant="outline" disabled title="PDF export will be generated server-side">
              <FileText className="h-3 w-3 mr-1" />PDF
            </Button>
          </div>

          <div className="border rounded-md max-h-[50vh] overflow-auto">
            {rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No data in this report.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r, i) => (
                    <TableRow key={i}>
                      {headers.map((h) => (
                        <TableCell key={h} className="whitespace-nowrap text-xs max-w-[260px] truncate">
                          {r[h] == null ? '' : typeof r[h] === 'object' ? JSON.stringify(r[h]) : String(r[h])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {rows.length > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-2 text-xs">
              <span className="text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
