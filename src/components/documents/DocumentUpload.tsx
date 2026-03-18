import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, Loader2, ShieldCheck, Plus, X, FileText } from 'lucide-react';
import { secureUpload, validateFile, ACCEPT_STRING, MAX_FILE_SIZE } from '@/lib/secureFileUpload';

interface DocumentUploadProps {
  entityType: string;
  entityId: string;
  onUploaded: () => void;
}

export function DocumentUpload({ entityType, entityId, onUploaded }: DocumentUploadProps) {
  const { user } = useAuth();
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles: File[] = [];
    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid) {
        toast.error(`${file.name}: ${validation.error}`);
      } else {
        validFiles.push(file);
      }
    }

    setStagedFiles(prev => [...prev, ...validFiles]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = async () => {
    if (!user || stagedFiles.length === 0) return;
    setUploading(true);

    let successCount = 0;
    for (const file of stagedFiles) {
      const result = await secureUpload(file, user.id, entityType, entityId);
      if (result.success) {
        successCount++;
      } else {
        toast.error(`Failed to upload ${file.name}: ${result.error}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} document${successCount > 1 ? 's' : ''} uploaded securely`);
      onUploaded();
    }

    setStagedFiles([]);
    setUploading(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={handleFilesSelected}
        accept={ACCEPT_STRING}
        multiple
      />

      {/* Staged files list */}
      {stagedFiles.length > 0 && (
        <div className="space-y-2 rounded-md border border-border p-3">
          {stagedFiles.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">({formatSize(file.size)})</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeFile(idx)} disabled={uploading}>
                <X className="h-3 w-3" />
              </Button>
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
          {stagedFiles.length > 0 ? 'Add More' : 'Add Document'}
        </Button>

        {stagedFiles.length > 0 && (
          <Button size="sm" onClick={handleUploadAll} disabled={uploading}>
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Uploading {stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''}...</>
            ) : (
              <><Upload className="h-4 w-4 mr-1" />Upload {stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''}</>
            )}
          </Button>
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          <span>Max {MAX_FILE_SIZE / (1024 * 1024)}MB · Private storage</span>
        </div>
      </div>
    </div>
  );
}
