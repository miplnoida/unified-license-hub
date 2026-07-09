import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, X, FileText, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { validateFile, ACCEPT_STRING, MAX_FILE_SIZE } from '@/lib/secureFileUpload';
import { MAX_COMPLAINT_ATTACHMENTS } from '@/lib/complaintAttachments';

interface ComplaintAttachmentsFieldProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
}

export function ComplaintAttachmentsField({
  files,
  onChange,
  disabled,
  label = 'Attachments (optional)',
}: ComplaintAttachmentsFieldProps) {
  const ref = useRef<HTMLInputElement>(null);

  const handleAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;

    const next = [...files];
    for (const f of picked) {
      if (next.length >= MAX_COMPLAINT_ATTACHMENTS) {
        toast.error(`Maximum ${MAX_COMPLAINT_ATTACHMENTS} attachments allowed`);
        break;
      }
      const v = validateFile(f);
      if (!v.valid) {
        toast.error(`${f.name}: ${v.error}`);
        continue;
      }
      next.push(f);
    }
    onChange(next);
    if (ref.current) ref.current.value = '';
  };

  const remove = (idx: number) => onChange(files.filter((_, i) => i !== idx));

  const fmt = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <input
        ref={ref}
        type="file"
        className="hidden"
        multiple
        accept={ACCEPT_STRING}
        onChange={handleAdd}
        disabled={disabled}
      />
      {files.length > 0 && (
        <div className="space-y-1 rounded-md border border-border p-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">({fmt(f.size)})</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => remove(i)} disabled={disabled}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => ref.current?.click()}
          disabled={disabled || files.length >= MAX_COMPLAINT_ATTACHMENTS}
        >
          <Plus className="h-4 w-4 mr-1" />
          {files.length > 0 ? 'Add more' : 'Add attachment'}
        </Button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          <span>Max {MAX_COMPLAINT_ATTACHMENTS} files · {MAX_FILE_SIZE / (1024 * 1024)}MB each · Private storage</span>
        </div>
      </div>
    </div>
  );
}
