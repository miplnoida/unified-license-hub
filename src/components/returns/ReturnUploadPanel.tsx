/**
 * ReturnUploadPanel
 *
 * Lets a licensee download an XLSX/XML template for the return they are
 * currently filling, upload a completed file, preview parsed changes, and
 * commit them into the return in one transaction via the SECURITY DEFINER
 * `import_return_form_data` RPC.
 *
 * Every download, upload and import is recorded for audit in
 * `return_template_downloads`, `return_upload_attempts`, and
 * `return_upload_imports`. The uploaded file itself is stored (private) in
 * the `return-uploads` bucket.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Download, Upload, FileSpreadsheet, FileCode2, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
  buildXlsxTemplate,
  buildXmlTemplate,
  parseXlsxUpload,
  parseXmlUpload,
  summarizeParse,
  type ParseResult,
  type ReturnUploadFormSpec,
} from '@/lib/returnTemplate';

interface OrderedForm {
  form_id: string;
  form_templates?: { id: string; name: string } | null;
}

interface Props {
  returnId: string;
  returnUniqueId: string;
  licenseeId: string | null;
  orderedForms: OrderedForm[];
  allData: Record<string, Record<string, any>>;
  disabled?: boolean;
  onImported: () => void | Promise<void>;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function ReturnUploadPanel({
  returnId, returnUniqueId, licenseeId, orderedForms, allData, disabled, onImported,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [strategy, setStrategy] = useState<'replace' | 'fill_blanks'>('fill_blanks');
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attemptFile, setAttemptFile] = useState<string | null>(null);

  const formIds = orderedForms.map((f) => f.form_id).sort().join(',');

  // Resolve versions + fields for every form in this return.
  const {
    data: specs = [],
    isLoading: loadingSpecs,
    error: specsError,
  } = useQuery<ReturnUploadFormSpec[]>({
    queryKey: ['return_upload_specs', returnId, formIds],
    enabled: !!returnId && orderedForms.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const resolved = await Promise.all(
        orderedForms.map(async (f) => {
          const { data, error } = await (supabase as any).rpc('resolve_return_form_version', {
            _return_submission_id: returnId,
            _template_id: f.form_id,
          });
          if (error) return { form: f, versionId: null as string | null };
          return { form: f, versionId: (data as any)?.version_id ?? null };
        }),
      );
      const versionIds = Array.from(new Set(resolved.map((r) => r.versionId).filter(Boolean))) as string[];
      const fieldsByVersion = new Map<string, any[]>();
      if (versionIds.length > 0) {
        const { data: fields } = await supabase
          .from('form_fields')
          .select('version_id, field_name, label, field_type, line_code, section_title, section_order, sort_order')
          .in('version_id', versionIds)
          .order('section_order', { ascending: true })
          .order('sort_order', { ascending: true });
        for (const row of (fields as any[]) || []) {
          const list = fieldsByVersion.get(row.version_id) || [];
          list.push(row);
          fieldsByVersion.set(row.version_id, list);
        }
      }
      return resolved.map(({ form, versionId }) => {
        const rawFields = (versionId ? fieldsByVersion.get(versionId) : []) || [];
        return {
          formId: form.form_id,
          templateName: form.form_templates?.name || 'Form',
          formVersionId: versionId,
          fields: rawFields.map((r) => ({
            field_name: r.field_name,
            label: r.label,
            field_type: r.field_type,
            line_code: r.line_code,
            section_title: r.section_title,
          })),
          currentValues: (allData[form.form_id] || {}) as Record<string, string>,
        };
      });
    },
  });

  const totalFields = useMemo(
    () => specs.reduce((n, s) => n + s.fields.length, 0),
    [specs],
  );

  const fingerprint = useMemo(
    () => specs.map((s) => `${s.formId}:${s.formVersionId ?? 'v0'}`).join('|'),
    [specs],
  );

  const logDownload = async (format: 'xlsx' | 'xml') => {
    await supabase.from('return_template_downloads' as any).insert({
      return_id: returnId,
      licensee_id: licenseeId,
      form_version_ids: specs.map((s) => s.formVersionId).filter(Boolean) as string[],
      format,
      fingerprint,
      downloaded_by: user?.id ?? null,
      metadata: { total_fields: totalFields, form_count: specs.length },
    } as any);
  };

  const downloadTemplate = async (format: 'xlsx' | 'xml') => {
    if (specs.length === 0) {
      toast.error('No forms available for this return yet.');
      return;
    }
    const blob = format === 'xlsx'
      ? buildXlsxTemplate(returnUniqueId, specs)
      : buildXmlTemplate(returnUniqueId, specs);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${returnUniqueId.replace(/\s+/g, '_')}_template.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    await logDownload(format);
    toast.success(`${format.toUpperCase()} template downloaded`);
  };

  const resetSelection = () => {
    setParseResult(null);
    setAttemptId(null);
    setAttemptFile(null);
  };

  const handleFile = async (file: File) => {
    if (!user?.id) { toast.error('You must be signed in to upload.'); return; }
    if (file.size === 0) { toast.error('The file is empty.'); return; }
    if (file.size > MAX_FILE_SIZE) { toast.error('File exceeds the 20MB limit.'); return; }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xml') {
      toast.error('Only .xlsx or .xml files generated from the template are supported.');
      return;
    }

    setUploading(true);
    resetSelection();
    try {
      const path = `${user.id}/${returnId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('return-uploads').upload(path, file, {
        cacheControl: '0', upsert: false, contentType: file.type || undefined,
      });
      if (upErr) throw new Error(upErr.message);
      setAttemptFile(path);

      const parsed = ext === 'xlsx'
        ? await parseXlsxUpload(file, specs, strategy)
        : await parseXmlUpload(file, specs, strategy);
      setParseResult(parsed);

      const status = parsed.errors.length > 0 ? 'invalid' : 'validated';
      const { data: rec, error: recErr } = await supabase
        .from('return_upload_attempts' as any)
        .insert({
          return_id: returnId,
          licensee_id: licenseeId,
          uploaded_by: user.id,
          original_filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          storage_path: path,
          form_version_ids: parsed.formVersionIds,
          fingerprint,
          status,
          summary: summarizeParse(parsed),
          errors: parsed.errors,
          warnings: parsed.warnings,
        } as any)
        .select('id')
        .single();
      if (recErr) throw new Error(recErr.message);
      setAttemptId((rec as any).id);
      if (parsed.errors.length > 0) toast.error('File uploaded, but validation failed. Fix and try again.');
      else if ((parsed.nonEmptyRows ?? parsed.rows.length) === 0) toast.warning('File uploaded, but no populated values were found to import.');
      else toast.success('File parsed successfully. Review changes below before importing.');
    } catch (e: any) {
      toast.error(`Upload failed: ${e?.message || 'unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const commit = async () => {
    const nonEmptyRows = parseResult?.nonEmptyRows ?? parseResult?.rows.length ?? 0;
    if (!parseResult || parseResult.rows.length === 0 || nonEmptyRows === 0 || !attemptId) return;
    const confirm = await Swal.fire({
      title: 'Import uploaded values?',
      html: `<p>This will ${strategy === 'replace' ? '<b>overwrite existing values</b>' : 'only fill blank fields'} for <b>${nonEmptyRows}</b> populated field(s).</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Import',
    });
    if (!confirm.isConfirmed) return;

    setImporting(true);
    try {
      const { data, error } = await (supabase as any).rpc('import_return_form_data', {
        _return_id: returnId,
        _strategy: strategy,
        _rows: parseResult.rows as any,
      });
      if (error) throw new Error(error.message);

      const result = Array.isArray(data) ? data[0] : data;
      const written = Number(result?.values_written ?? 0);
      const forms = (result?.forms_touched ?? []) as string[];

      await supabase.from('return_upload_imports' as any).insert({
        upload_id: attemptId,
        strategy,
        values_written: written,
        forms_touched: forms,
        committed_by: user?.id ?? null,
      } as any);
      await supabase.from('return_upload_attempts' as any)
        .update({ status: 'imported' } as any)
        .eq('id', attemptId);

      toast.success(`Imported ${written} value${written === 1 ? '' : 's'} into ${forms.length} form${forms.length === 1 ? '' : 's'}.`);
      resetSelection();
      await qc.invalidateQueries({ queryKey: ['return_form_data', returnId] });
      await onImported();
    } catch (e: any) {
      toast.error(`Import failed: ${e?.message || 'unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const specsMap = useMemo(
    () => new Map(specs.map((s) => [s.formId, s])),
    [specs],
  );

  const parseSummary = parseResult ? summarizeParse(parseResult) : null;
  const parsedNonEmptyRows = parseSummary?.nonEmptyRows ?? 0;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" /> Bulk Upload
          <Badge variant="outline" className="ml-2">{specs.length} form{specs.length === 1 ? '' : 's'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {specsError && (
          <Alert variant="destructive"><AlertDescription>Could not load form definitions.</AlertDescription></Alert>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button data-rbac="returns_management.edit" variant="outline" size="sm" onClick={() => downloadTemplate('xlsx')}
            disabled={loadingSpecs || specs.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Download XLSX Template
          </Button>
          <Button data-rbac="returns_management.edit" variant="outline" size="sm" onClick={() => downloadTemplate('xml')}
            disabled={loadingSpecs || specs.length === 0}>
            <FileCode2 className="h-4 w-4 mr-2" /> Download XML Template
          </Button>
          <span className="text-xs text-muted-foreground">
            Templates contain current values for every field so you can edit offline.
          </span>
        </div>

        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Label className="text-sm font-medium">Import Strategy</Label>
              <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as any)} className="mt-2 flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="fill_blanks" id="strat-fb" />
                  <Label htmlFor="strat-fb" className="text-sm font-normal">Fill blanks only</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="replace" id="strat-rp" />
                  <Label htmlFor="strat-rp" className="text-sm font-normal">Replace populated fields</Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <input
                type="file"
                id="return-upload-input"
                accept=".xlsx,.xml"
                className="hidden"
                disabled={disabled || uploading || importing || specs.length === 0}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = '';
                }}
              />
              <Button
                onClick={() => document.getElementById('return-upload-input')?.click()}
                disabled={disabled || uploading || importing || specs.length === 0}
                size="sm"
              >
                {uploading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                  : <><Upload className="h-4 w-4 mr-2" />Upload File</>}
              </Button>
            </div>
          </div>

          {parseResult && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium flex items-center gap-2">
                  {parseResult.errors.length === 0
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <AlertTriangle className="h-4 w-4 text-destructive" />}
                  {parsedNonEmptyRows} value{parsedNonEmptyRows === 1 ? '' : 's'} ready to import
                </div>
                <Button data-rbac="returns_management.edit" variant="ghost" size="sm" onClick={resetSelection}>
                  <X className="h-3.5 w-3.5 mr-1" />Discard
                </Button>
              </div>
              <Progress value={totalFields === 0 ? 0 : Math.min(100, (parsedNonEmptyRows / totalFields) * 100)} className="h-1.5" />

              {parseSummary && Object.entries(parseSummary.perForm).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(parseSummary.perForm).map(([fid, count]) => (
                    <Badge key={fid} variant="secondary">
                      {specsMap.get(fid)?.templateName || 'Form'} · {count}
                    </Badge>
                  ))}
                </div>
              )}

              {parsedNonEmptyRows === 0 && parseResult.errors.length === 0 && (
                <Alert>
                  <AlertDescription>
                    No populated values were found in the upload. Enter data in the New Value column, then upload again.
                  </AlertDescription>
                </Alert>
              )}

              {parseResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <div className="font-medium mb-1">Errors</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {parseResult.errors.slice(0, 10).map((e, i) => (
                        <li key={i}><span className="font-medium">{e.scope}:</span> {e.message}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {parseResult.warnings.length > 0 && (
                <Alert>
                  <AlertDescription>
                    <div className="font-medium mb-1">Warnings</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {parseResult.warnings.slice(0, 10).map((w, i) => (
                        <li key={i}><span className="font-medium">{w.scope}:</span> {w.message}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={commit}
                  disabled={
                    disabled || importing || parseResult.errors.length > 0 || parseResult.rows.length === 0 || parsedNonEmptyRows === 0
                  }
                >
                  {importing
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</>
                    : <><Download className="h-4 w-4 mr-2 rotate-180" />Import into Return</>}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
