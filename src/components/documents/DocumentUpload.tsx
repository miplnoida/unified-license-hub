import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, Loader2, File } from 'lucide-react';

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

    if (file.size > 20 * 1024 * 1024) {
      toast.error('File size must be less than 20MB');
      return;
    }

    setUploading(true);
    const filePath = `${entityType}/${entityId}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) {
      toast.error('Upload failed: ' + uploadError.message);
      setUploading(false);
      return;
    }

    // Record in documents table
    const { error: dbError } = await supabase.from('documents').insert({
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: user.id,
      entity_type: entityType,
      entity_id: entityId,
    } as any);

    if (dbError) {
      toast.error('Failed to save document record');
      setUploading(false);
      return;
    }

    toast.success('Document uploaded');
    setUploading(false);
    onUploaded();

    // Reset input
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={handleUpload}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
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
      <span className="text-xs text-muted-foreground">Max 20MB. PDF, DOC, XLS, images</span>
    </div>
  );
}
