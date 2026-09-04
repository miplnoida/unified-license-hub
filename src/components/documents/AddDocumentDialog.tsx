/**
 * Add Document — the standard, reusable "Upload New" experience.
 *
 * The officer chooses a file, a category and a document type. The business
 * record it belongs to comes from the screen's own context and is never typed:
 * no database identifiers appear in this dialog. Uploading and filing into the
 * central document register are a single governed operation.
 */
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, ShieldCheck, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACCEPT_STRING, MAX_FILE_SIZE, validateFile } from '@/lib/secureFileUpload';
import { useDmsTaxonomy } from '@/hooks/useDmsDocuments';
import { uploadNewDocument, type DmsIngestContext } from '@/services/dmsIngest';

export interface AddDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Business record this document belongs to, supplied by the host screen. */
  context: Pick<DmsIngestContext, 'recordType' | 'recordId' | 'sourceModule'>;
  /** Plain-language description of where the document will be filed. */
  contextLabel: string;
  defaultCategoryCode?: string;
  onUploaded?: (documentReference: string | null) => void;
}

export function AddDocumentDialog({
  open, onOpenChange, context, contextLabel, defaultCategoryCode, onUploaded,
}: AddDocumentDialogProps) {
  const { data: taxonomy } = useDmsTaxonomy();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [categoryCode, setCategoryCode] = useState(defaultCategoryCode ?? '');
  const [typeCode, setTypeCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const types = useMemo(() => {
    const cat = (taxonomy?.categories ?? []).find((c) => c.code === categoryCode);
    return (taxonomy?.types ?? []).filter((t) => !cat || t.category_id === cat.id);
  }, [taxonomy, categoryCode]);

  const reset = () => {
    setFile(null); setTypeCode(''); setDisplayName(''); setNote('');
    setCategoryCode(defaultCategoryCode ?? '');
    if (fileRef.current) fileRef.current.value = '';
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    const check = validateFile(chosen);
    if (!check.valid) { toast.error(check.error ?? 'That file cannot be accepted.'); return; }
    setFile(chosen);
    if (!displayName) setDisplayName(chosen.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    const result = await uploadNewDocument({
      file,
      displayName: displayName.trim() || file.name,
      changeNote: note.trim() || null,
      context: {
        recordType: context.recordType,
        recordId: context.recordId,
        sourceModule: context.sourceModule ?? null,
        categoryCode: categoryCode || null,
        typeCode: typeCode || null,
      },
    });
    setBusy(false);

    if (result.success !== true) { toast.error(result.error); return; }

    if (result.data.filingNotice) {
      toast.warning(result.data.filingNotice, {
        description: `${result.data.documentReference ?? 'The document'} is registered and safe. An officer with document administration rights can complete its filing.`,
      });
    } else {
      toast.success(`${result.data.documentReference ?? 'Document'} added`, {
        description: 'Registered in the central document register and filed against this record. It becomes viewable once the security scan completes.',
      });
    }
    onUploaded?.(result.data.documentReference);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { if (!next) reset(); onOpenChange(next); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
          <DialogDescription>
            The document is registered centrally and filed against {contextLabel} automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input ref={fileRef} type="file" className="hidden" accept={ACCEPT_STRING} onChange={pick} />

          {file ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" disabled={busy} onClick={() => setFile(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" data-rbac="document_management.upload" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Choose file
            </Button>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={categoryCode} onValueChange={(v) => { setCategoryCode(v); setTypeCode(''); }} disabled={busy}>
                <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                <SelectContent>
                  {(taxonomy?.categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Document type</Label>
              <Select value={typeCode} onValueChange={setTypeCode} disabled={busy || !categoryCode}>
                <SelectTrigger><SelectValue placeholder={categoryCode ? 'Select a type' : 'Choose a category first'} /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t.id} value={t.code}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Document name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={busy}
              placeholder="How this document should appear in the register" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy}
              placeholder="Why this document is being added" />
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Maximum {MAX_FILE_SIZE / (1024 * 1024)}MB. Files are scanned for malware before they can be opened.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-rbac="document_management.upload" disabled={busy || !file || !categoryCode || !typeCode} onClick={submit}>
            {busy ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</>) : 'Add document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddDocumentDialog;
