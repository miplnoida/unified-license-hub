import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Upload, CheckCircle2, AlertTriangle, Download } from 'lucide-react';

/**
 * Phase 2.7 — Bulk Intake (ULRA-010)
 *
 * Admin-only CSV upload → server-side validation → preview → commit.
 * Creates draft applications, assigned to the originator. Only workflow types
 * flagged `bulk_intake_enabled` are selectable.
 */

interface RowResult {
  row_number: number;
  status: 'ok' | 'error';
  errors: string[];
  applicant_id?: string;
  license_type?: string;
  application_id?: string;
  application_number?: string;
}

// Fixed columns handled at the top level of the row payload; everything else is
// merged into `data`.
const RESERVED = new Set(['applicant_email', 'license_type', 'regulator_id']);

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Simple CSV parser (RFC 4180-ish): commas, quoted fields, escaped quotes.
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n') { cur.push(field); lines.push(cur); cur = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else { field += ch; }
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); lines.push(cur); }
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.length === 1 && l[0] === '') continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (l[idx] ?? '').trim(); });
    rows.push(obj);
  }
  return { headers, rows };
}

export default function BulkIntake() {
  const [workflowKey, setWorkflowKey] = useState<string>('');
  const [csvText, setCsvText] = useState<string>('');
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [preview, setPreview] = useState<RowResult[] | null>(null);
  const [committing, setCommitting] = useState(false);
  const [validating, setValidating] = useState(false);

  const { data: workflowTypes } = useQuery({
    queryKey: ['workflow_types_bulk_enabled'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_workflow_types')
        .select('key, display_label, bulk_intake_enabled, is_active')
        .eq('bulk_intake_enabled', true)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
  });

  const payloadRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((r, idx) => {
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (!RESERVED.has(k) && v !== '') data[k] = v;
      }
      return {
        row_number: idx + 2, // account for header row = line 1
        applicant_email: r.applicant_email || undefined,
        license_type: r.license_type || undefined,
        regulator_id: r.regulator_id || undefined,
        data,
      };
    });
  }, [parsed]);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    const p = parseCsv(text);
    setParsed(p);
    setPreview(null);
  };

  const validate = async () => {
    if (!workflowKey || payloadRows.length === 0) return;
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-intake', {
        body: { action: 'validate', workflow_type_key: workflowKey, rows: payloadRows },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setPreview((data as any).rows as RowResult[]);
      toast.success(`Validated ${payloadRows.length} rows — ${(data as any).errors} error(s)`);
    } catch (e: any) {
      toast.error(e?.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const commit = async () => {
    if (!preview || preview.some((r) => r.status === 'error')) {
      toast.error('Fix all errors before committing.');
      return;
    }
    setCommitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-intake', {
        body: { action: 'commit', workflow_type_key: workflowKey, rows: payloadRows },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Created ${(data as any).created} draft applications`);
      setPreview((data as any).rows as RowResult[]);
    } catch (e: any) {
      toast.error(e?.message || 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = 'applicant_email,license_type,regulator_id,company_name,contact_phone\napplicant@example.com,pre_license,,Acme Ltd,+1 555 0100\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-intake-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorCount = preview?.filter((r) => r.status === 'error').length ?? 0;
  const okCount = preview?.filter((r) => r.status === 'ok').length ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Bulk Application Intake"
          description="Upload a CSV to stage draft applications in bulk. Rows are validated server-side before any records are created."
          backHref="/admin"
          backLabel="Back to Admin"
          actions={
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" /> CSV Template
            </Button>
          }
        />

        <Card>
          <CardHeader><CardTitle className="text-base">1. Configure</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Workflow type</Label>
              <Select value={workflowKey} onValueChange={setWorkflowKey}>
                <SelectTrigger><SelectValue placeholder="Choose a bulk-enabled workflow" /></SelectTrigger>
                <SelectContent>
                  {(workflowTypes ?? []).length === 0 && (
                    <SelectItem value="__none__" disabled>No workflow types are bulk-intake enabled</SelectItem>
                  )}
                  {(workflowTypes ?? []).map((w: any) => (
                    <SelectItem key={w.key} value={w.key}>{w.display_label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Enable a workflow type for bulk intake in <a href="/admin" className="underline">Admin → Workflow Configuration</a>.
              </p>
            </div>
            <div>
              <Label>CSV file</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Required columns: <code>applicant_email</code>, <code>license_type</code>. Any additional columns are merged into the application's data payload. Max 500 rows.
              </p>
            </div>
          </CardContent>
        </Card>

        {parsed && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">2. Preview — {parsed.rows.length} rows</CardTitle>
              <div className="flex gap-2">
                <Button onClick={validate} disabled={!workflowKey || validating || parsed.rows.length === 0} variant="outline">
                  {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Upload className="h-4 w-4 mr-2" /> Validate
                </Button>
                <Button
                  onClick={commit}
                  disabled={!preview || errorCount > 0 || committing}
                >
                  {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Commit {okCount > 0 ? `(${okCount})` : ''}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {preview && (
                <div className="mb-3 text-sm">
                  <Badge variant="outline" className="bg-green-100 text-green-800 mr-2">{okCount} OK</Badge>
                  {errorCount > 0 && (
                    <Badge variant="outline" className="bg-red-100 text-red-800"><AlertTriangle className="h-3 w-3 mr-1" /> {errorCount} error(s)</Badge>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Status</TableHead>
                      {parsed.headers.map((h) => <TableHead key={h}>{h}</TableHead>)}
                      <TableHead>Errors / Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.map((row, idx) => {
                      const res = preview?.[idx];
                      return (
                        <TableRow key={idx} className={res?.status === 'error' ? 'bg-red-50/40' : ''}>
                          <TableCell className="text-xs">{idx + 2}</TableCell>
                          <TableCell>
                            {!res && <Badge variant="outline">pending</Badge>}
                            {res?.status === 'ok' && <Badge variant="outline" className="bg-green-100 text-green-800">OK</Badge>}
                            {res?.status === 'error' && <Badge variant="outline" className="bg-red-100 text-red-800">Error</Badge>}
                          </TableCell>
                          {parsed.headers.map((h) => (
                            <TableCell key={h} className="text-xs max-w-[180px] truncate">{row[h]}</TableCell>
                          ))}
                          <TableCell className="text-xs">
                            {res?.errors?.length ? (
                              <span className="text-red-700">{res.errors.join('; ')}</span>
                            ) : res?.application_number ? (
                              <span className="text-green-700">Created: {res.application_number}</span>
                            ) : ''}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
