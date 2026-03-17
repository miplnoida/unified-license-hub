import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, Loader2, ShieldCheck } from 'lucide-react';
import { secureUpload, validateFile, ACCEPT_STRING, MAX_FILE_SIZE } from '@/lib/secureFileUpload';

interface DocumentUploadProps {
  entityType: string;
  entityId: string;
  onUploaded: () => void;
}

export function DocumentUpload({ entityType, entityId, onUploaded }: DocumentUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Client-side validation first
    const validation = validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setUploading(true);

    const result = await secureUpload(file, user.id, entityType, entityId);

    if (!result.success) {
      toast.error(result.error || 'Upload failed');
    } else {
      toast.success('Document uploaded securely');
      onUploaded();
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={handleUpload}
        accept={ACCEPT_STRING}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
        ) : (
          <><Upload className="h-4 w-4 mr-2" />Upload Document</>
        )}
      </Button>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <ShieldCheck className="h-3 w-3" />
        <span>Max {MAX_FILE_SIZE / (1024 * 1024)}MB · Private storage · Signed URLs</span>
      </div>
    </div>
  );
}
