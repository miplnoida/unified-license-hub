import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, FileText, Download, Trash2, Loader2, Eye } from 'lucide-react';

interface Attachment {
  id: string;
  payment_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  bucket_name: string;
  uploaded_by: string;
  created_at: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

interface Props {
  paymentId: string;
  readOnly?: boolean;
}

export function PaymentAttachments({ paymentId, readOnly = false }: Props) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAttachments = useCallback(async () => {
    const { data, error } = await supabase
      .from('payment_attachments' as any)
      .select('*')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: false });
    if (!error) setAttachments((data || []) as any);
    setLoading(false);
  }, [paymentId]);

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 10MB limit`);
        continue;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: unsupported file type. Use PDF, JPG, PNG, or DOC.`);
        continue;
      }
      // Duplicate check
      if (attachments.some(a => a.file_name === file.name)) {
        toast.error(`${file.name} is already uploaded`);
        continue;
      }

      setUploading(true);
      const filePath = `${user.id}/${paymentId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('payment-documents')
        .upload(filePath, file, { contentType: file.type });

      if (uploadErr) {
        toast.error(`Upload failed: ${uploadErr.message}`);
        setUploading(false);
        continue;
      }

      const { error: insertErr } = await supabase.from('payment_attachments' as any).insert({
        payment_id: paymentId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        bucket_name: 'payment-documents',
        uploaded_by: user.id,
      } as any);

      if (insertErr) {
        toast.error(`Failed to save record: ${insertErr.message}`);
      } else {
        toast.success(`${file.name} uploaded`);
      }
      setUploading(false);
    }
    loadAttachments();
    e.target.value = '';
  };

  const handleDownload = async (att: Attachment) => {
    const { data, error } = await supabase.storage
      .from(att.bucket_name)
      .createSignedUrl(att.file_path, 300);
    if (error || !data?.signedUrl) {
      toast.error('Failed to generate download link');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (att: Attachment) => {
    await supabase.storage.from(att.bucket_name).remove([att.file_path]);
    const { error } = await supabase.from('payment_attachments' as any).delete().eq('id', att.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Attachment removed');
    loadAttachments();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading attachments...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Supporting Documents</h4>
        {!readOnly && (
          <label className="cursor-pointer">
            <Input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={handleUpload}
              disabled={uploading}
            />
            <Button variant="outline" size="sm" asChild disabled={uploading}>
              <span>
                {uploading ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Upload className="h-3 w-3 mr-1.5" />}
                Upload Proof
              </span>
            </Button>
          </label>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-3 rounded-md border p-2.5 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{att.file_name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(att.file_size)} · {new Date(att.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(att)} title="Download">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {att.mime_type.startsWith('image/') && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(att)} title="Preview">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                )}
                {!readOnly && att.uploaded_by === user?.id && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(att)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <p className="text-xs text-muted-foreground">
          Accepted: PDF, JPG, PNG, DOC/DOCX · Max 10MB per file
        </p>
      )}
    </div>
  );
}
