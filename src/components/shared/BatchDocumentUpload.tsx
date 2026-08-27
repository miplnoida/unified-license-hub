import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { validateFile, ACCEPT_STRING } from '@/lib/secureFileUpload';
import { toast } from 'sonner';

export type BatchDocumentType = {
  value: string;
  label: string;
};

export const DEFAULT_DOCUMENT_TYPES: BatchDocumentType[] = [
  { value: 'identity_proof', label: 'Identity Proof' },
  { value: 'address_proof', label: 'Address Proof' },
  { value: 'financial_statement', label: 'Financial Statement' },
  { value: 'incorporation_certificate', label: 'Incorporation Certificate' },
  { value: 'board_resolution', label: 'Board Resolution' },
  { value: 'business_plan', label: 'Business Plan' },
  { value: 'compliance_report', label: 'Compliance Report' },
  { value: 'supporting_document', label: 'Supporting Document' },
  { value: 'other', label: 'Other' },
];

export interface StagedFile {
  id: string;
  file: File;
  docType: string;
  description: string;
  confidential: boolean;
  error?: string;
}

export interface BatchUploadResult {
  fileUploadId: string;
  filePath: string;
  fileName: string;
  docType: string;
  description: string;
  confidential: boolean;
}

interface BatchDocumentUploadProps {
  entityType: string;
  entityId?: string;
  userId: string;
  documentTypes?: BatchDocumentType[];
  onUploaded?: (results: BatchUploadResult[]) => void;
  helperText?: string;
}

/**
 * Reusable batch document uploader with per-file metadata (Phase 2.2 / ULRA-002).
 * Users can stage multiple files, assign a document type, description and
 * confidentiality flag per file, then upload them all in one action.
 * Extra metadata is persisted to the `file_uploads.metadata` JSONB column.
 */
export function BatchDocumentUpload({
  entityType,
  entityId,
  userId,
  documentTypes = DEFAULT_DOCUMENT_TYPES,
  onUploaded,
  helperText,
}: BatchDocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: StagedFile[] = [];
    Array.from(files).forEach((file) => {
      const v = validateFile(file);
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        docType: documentTypes[0]?.value ?? 'other',
        description: '',
        confidential: false,
        error: v.valid ? undefined : v.error,
      });
    });
    setStaged((prev) => [...prev, ...next]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const patch = (id: string, changes: Partial<StagedFile>) =>
    setStaged((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)));

  const remove = (id: string) => setStaged((prev) => prev.filter((s) => s.id !== id));

  const canUpload = staged.length > 0 && staged.every((s) => !s.error && s.docType);

  const uploadAll = async () => {
    if (!canUpload || uploading) return;
    setUploading(true);
    const results: BatchUploadResult[] = [];
    try {
      for (const item of staged) {
        const ext = '.' + item.file.name.split('.').pop()?.toLowerCase();
        const sanitized = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${userId}/${entityType}/${entityId || 'general'}/${Date.now()}-${sanitized}`;

        const { error: upErr } = await supabase.storage
          .from('secure-documents')
          .upload(filePath, item.file, { cacheControl: '3600', upsert: false });
        if (upErr) throw new Error(`${item.file.name}: ${upErr.message}`);

        const { data: rec, error: dbErr } = await supabase
          .from('file_uploads' as any)
          .insert({
            file_name: item.file.name,
            file_path: filePath,
            file_size: item.file.size,
            mime_type: item.file.type,
            file_extension: ext,
            uploaded_by: userId,
            entity_type: entityType,
            entity_id: entityId || null,
            bucket_name: 'secure-documents',
            scan_status: 'clean',
            metadata: {
              original_name: item.file.name,
              upload_timestamp: new Date().toISOString(),
              doc_type: item.docType,
              description: item.description,
              confidential: item.confidential,
              batch_upload: true,
            },
          } as any)
          .select('id')
          .single();

        if (dbErr) {
          await supabase.storage.from('secure-documents').remove([filePath]);
          throw new Error(`${item.file.name}: ${dbErr.message}`);
        }

        results.push({
          fileUploadId: (rec as any).id,
          filePath,
          fileName: item.file.name,
          docType: item.docType,
          description: item.description,
          confidential: item.confidential,
        });
      }
      toast.success(`Uploaded ${results.length} document${results.length === 1 ? '' : 's'}`);
      setStaged([]);
      onUploaded?.(results);
    } catch (e: any) {
      toast.error(e.message || 'Batch upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Label className="text-base">Batch document upload</Label>
          {helperText && <p className="text-sm text-muted-foreground mt-1">{helperText}</p>}
        </div>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_STRING}
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <Button data-rbac="settings.edit"
            variant="outline"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Plus className="mr-2 h-4 w-4" /> Add files
          </Button>
          <Button data-rbac="settings.edit" type="button" onClick={uploadAll} disabled={!canUpload || uploading}>
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            Upload {staged.length > 0 ? `(${staged.length})` : ''}
          </Button>
        </div>
      </div>

      {staged.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
          No files staged. Click <span className="font-medium">Add files</span> to queue documents.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">File</TableHead>
                <TableHead className="min-w-[180px]">Document type</TableHead>
                <TableHead className="min-w-[240px]">Description</TableHead>
                <TableHead className="text-center">Confidential</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staged.map((s) => (
                <TableRow key={s.id} className={s.error ? 'bg-destructive/5' : ''}>
                  <TableCell>
                    <div className="text-sm font-medium truncate max-w-[220px]" title={s.file.name}>
                      {s.file.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(s.file.size / 1024).toFixed(1)} KB
                    </div>
                    {s.error && (
                      <div className="text-xs text-destructive mt-1">{s.error}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={s.docType}
                      onValueChange={(v) => patch(s.id, { docType: v })}
                      disabled={uploading}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {documentTypes.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={s.description}
                      onChange={(e) => patch(s.id, { description: e.target.value })}
                      placeholder="Optional description"
                      disabled={uploading}
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={s.confidential}
                      onCheckedChange={(c) => patch(s.id, { confidential: !!c })}
                      disabled={uploading}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => remove(s.id)}
                      disabled={uploading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
