import { useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Upload, X, FileText, Loader2, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { validateFile, ACCEPT_STRING, MAX_FILE_SIZE } from '@/lib/secureFileUpload';
import {
  batchUploadDocuments,
  type BatchUploadItem,
  type BatchUploadResult,
} from '@/lib/documentVersioning';

interface StagedFile {
  file: File;
  documentType: string;
  displayName?: string;
  /** When set, this file uploads as a new version of an existing group. */
  groupId?: string;
  changeNote?: string;
  status: 'pending' | 'uploading' | 'success' | 'failed';
  error?: string;
  version?: number;
}

interface Props {
  entityType: string;
  entityId?: string | null;
  /** When fixed, every staged file uses this document type and the per-row picker is hidden. */
  defaultDocumentType?: string;
  /** Available document types when a picker is shown. */
  documentTypeOptions?: string[];
  /** When supplied with defaultDocumentType, all uploads become new versions of this group. */
  groupId?: string;
  onUploaded?: (results: BatchUploadResult[]) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VersionedDocumentUploader({
  entityType,
  entityId,
  defaultDocumentType,
  documentTypeOptions,
  groupId,
  onUploaded,
}: Props) {
  const { user } = useAuth();
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const next: StagedFile[] = [];
    for (const f of files) {
      const v = validateFile(f);
      if (!v.valid) {
        toast.error(`${f.name}: ${v.error}`);
        continue;
      }
      next.push({
        file: f,
        documentType: defaultDocumentType || documentTypeOptions?.[0] || 'general',
        groupId,
        status: 'pending',
      });
    }
    setStaged(prev => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeAt = (idx: number) =>
    setStaged(prev => prev.filter((_, i) => i !== idx));

  const updateAt = (idx: number, patch: Partial<StagedFile>) =>
    setStaged(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const handleUploadAll = async () => {
    if (!user) {
      toast.error('You must be signed in to upload documents');
      return;
    }
    if (staged.length === 0) return;

    setUploading(true);
    setStaged(prev => prev.map(s => (s.status === 'pending' ? { ...s, status: 'uploading' } : s)));

    const items: BatchUploadItem[] = staged
      .filter(s => s.status !== 'success')
      .map(s => ({
        file: s.file,
        documentType: s.documentType,
        displayName: s.displayName || s.file.name,
        groupId: s.groupId,
        changeNote: s.changeNote,
      }));

    const results = await batchUploadDocuments({
      userId: user.id,
      entityType,
      entityId: entityId || null,
      items,
    });

    setStaged(prev =>
      prev.map(s => {
        const r = results.find(x => x.fileName === s.file.name);
        if (!r) return s;
        return r.success
          ? { ...s, status: 'success', version: r.version }
          : { ...s, status: 'failed', error: r.error };
      }),
    );

    const ok = results.filter(r => r.success).length;
    const fail = results.length - ok;
    if (ok > 0) toast.success(`${ok} document${ok > 1 ? 's' : ''} uploaded`);
    if (fail > 0) toast.error(`${fail} upload${fail > 1 ? 's' : ''} failed`);

    setUploading(false);
    onUploaded?.(results);
  };

  const clearSucceeded = () => setStaged(prev => prev.filter(s => s.status !== 'success'));

  const showTypePicker = !defaultDocumentType && (documentTypeOptions?.length || 0) > 1;

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT_STRING}
        className="hidden"
        onChange={handleSelect}
      />

      {staged.length > 0 && (
        <div className="rounded-md border border-border divide-y">
          {staged.map((s, idx) => (
            <div key={`${s.file.name}-${idx}`} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{s.file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({formatSize(s.file.size)})
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.status === 'pending' && (
                    <span className="text-xs text-muted-foreground">Pending</span>
                  )}
                  {s.status === 'uploading' && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {s.status === 'success' && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      v{s.version}
                    </span>
                  )}
                  {s.status === 'failed' && (
                    <span className="flex items-center gap-1 text-xs text-destructive" title={s.error}>
                      <XCircle className="h-4 w-4" />
                      Failed
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeAt(idx)}
                    disabled={uploading || s.status === 'uploading'}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {showTypePicker && s.status === 'pending' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Document type</Label>
                    <select
                      value={s.documentType}
                      onChange={e => updateAt(idx, { documentType: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {documentTypeOptions!.map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Change note (optional)</Label>
                    <Input
                      value={s.changeNote || ''}
                      onChange={e => updateAt(idx, { changeNote: e.target.value })}
                      className="h-9"
                      placeholder="Initial upload"
                    />
                  </div>
                </div>
              )}

              {s.status === 'failed' && s.error && (
                <p className="text-xs text-destructive">{s.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Plus className="h-4 w-4 mr-1" />
          {staged.length > 0 ? 'Add more' : 'Choose files'}
        </Button>

        {staged.some(s => s.status === 'pending' || s.status === 'failed') && (
          <Button size="sm" onClick={handleUploadAll} disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1" />
                Upload {staged.filter(s => s.status !== 'success').length} file
                {staged.filter(s => s.status !== 'success').length > 1 ? 's' : ''}
              </>
            )}
          </Button>
        )}

        {staged.some(s => s.status === 'success') && (
          <Button variant="ghost" size="sm" onClick={clearSucceeded} disabled={uploading}>
            Clear uploaded
          </Button>
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <ShieldCheck className="h-3 w-3" />
          <span>Max {MAX_FILE_SIZE / (1024 * 1024)}MB · Private · Versioned</span>
        </div>
      </div>
    </div>
  );
}
