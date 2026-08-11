import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import {
  parseCsv,
  useComplaintBulkImport,
  useComplaintImportBatches,
  useComplaintImportRows,
} from '@/hooks/useComplaintBulkImport';

const OUTCOME_TONE: Record<string, string> = {
  imported: 'bg-primary/10 text-primary border-primary/30',
  duplicate: 'bg-muted text-muted-foreground',
  invalid: 'bg-destructive/10 text-destructive border-destructive/30',
  failed: 'bg-destructive/10 text-destructive border-destructive/30',
};

/**
 * MCS-CMP-005 — controlled batch complaint intake.
 * Rows are validated server-side; invalid and duplicate rows are recorded
 * with a reason and are never imported as complaints.
 */
export default function ComplaintBulkIntake() {
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<string | undefined>();

  const { data: batches, isLoading: batchesLoading } = useComplaintImportBatches();
  const { data: rows, isLoading: rowsLoading } = useComplaintImportRows(selectedBatch);
  const importer = useComplaintBulkImport();

  const parsed = useMemo(() => (raw.trim() ? parseCsv(raw) : []), [raw]);

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setRaw(await file.text());
  };

  const run = async () => {
    if (!parsed.length) { toast.error('No rows to import'); return; }
    try {
      const res = await importer.mutateAsync({
        source: fileName ? 'csv' : 'paste',
        fileName: fileName || 'pasted-rows.csv',
        rows: parsed,
      });
      setSelectedBatch(res.batch_id);
      toast.success(
        `Batch processed — ${res.imported} imported, ${res.invalid} invalid, ${res.duplicates} duplicate`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Bulk complaint intake"
          description="Import a batch of complaints. Every row is validated server-side; rejected rows are reported individually."
          backHref="/complaints"
          backLabel="Complaints"
        />

        <Card>
          <CardHeader><CardTitle className="text-base">Source</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <Label htmlFor="bulk-file">CSV file</Label>
                <Input id="bulk-file" type="file" accept=".csv,text/csv"
                  onChange={(e) => onFile(e.target.files?.[0])} />
              </div>
              <div className="text-xs text-muted-foreground self-end">
                Expected columns: <code>subject, description, email, licensee_id, complaint_type_id</code>. Severity is assigned automatically from triage configuration and is ignored if present in the file.
              </div>
            </div>
            <div>
              <Label htmlFor="bulk-raw">Or paste CSV rows</Label>
              <Textarea id="bulk-raw" rows={6} value={raw} onChange={(e) => setRaw(e.target.value)}
                placeholder="subject,description,email" />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={run} disabled={importer.isPending || !parsed.length} data-rbac="complaint_management.edit">
                {importer.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Process batch
              </Button>
              <span className="text-sm text-muted-foreground">{parsed.length} row(s) detected</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Batches</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {batchesLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : !batches?.length ? (
              <p className="text-sm text-muted-foreground">No batches yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead><TableHead>File</TableHead><TableHead>Status</TableHead>
                    <TableHead>Total</TableHead><TableHead>Imported</TableHead>
                    <TableHead>Invalid</TableHead><TableHead>Duplicate</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b: any) => (
                    <TableRow key={b.id} className={selectedBatch === b.id ? 'bg-muted/50' : undefined}>
                      <TableCell>{new Date(b.created_at).toLocaleString()}</TableCell>
                      <TableCell>{b.file_name || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                      <TableCell>{b.total_rows}</TableCell>
                      <TableCell>{b.imported_rows}</TableCell>
                      <TableCell>{b.invalid_rows}</TableCell>
                      <TableCell>{b.duplicate_rows}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedBatch(b.id)}>Rows</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {selectedBatch && (
          <Card>
            <CardHeader><CardTitle className="text-base">Row outcomes</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {rowsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : !rows?.length ? (
                <p className="text-sm text-muted-foreground">No rows recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead><TableHead>Subject</TableHead><TableHead>Outcome</TableHead>
                      <TableHead>Complaint</TableHead><TableHead>Reason / errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.row_number}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{String(r.raw_data?.subject ?? '—')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={OUTCOME_TONE[r.outcome]}>{r.outcome}</Badge>
                        </TableCell>
                        <TableCell>
                          {r.complaint_id ? (
                            <Link className="underline" to={`/complaints/${r.complaint_id}`}>{r.complaint_number}</Link>
                          ) : r.duplicate_of_complaint_id ? (
                            <Link className="underline" to={`/complaints/${r.duplicate_of_complaint_id}`}>existing case</Link>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.rejection_reason || '—'}
                          {r.validation_errors?.length ? (
                            <ul className="mt-1 list-disc pl-4 text-destructive">
                              {r.validation_errors.map((e, i) => <li key={i}>{e.field}: {e.message}</li>)}
                            </ul>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
