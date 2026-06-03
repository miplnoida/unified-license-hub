import { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Download, ShieldCheck, Trash2, Eye, RefreshCcw, CheckCircle2, XCircle } from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { secureDownload, secureDelete, getSignedUrl, replaceSecureUpload, validateFile, ACCEPT_STRING } from '@/lib/secureFileUpload';
import { useAuth } from '@/contexts/AuthContext';

interface FileUpload {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  file_extension: string;
  uploaded_by: string;
  entity_type: string;
  entity_id: string | null;
  bucket_name: string;
  scan_status: string;
  access_count: number;
  created_at: string;
  uploader_email?: string;
  metadata?: Record<string, any> | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function DocumentStore() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [replaceTarget, setReplaceTarget] = useState<FileUpload | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async () => {
    setLoading(true);

    // Load from both tables: legacy documents + new file_uploads
    const [{ data: legacyDocs }, { data: uploads }] = await Promise.all([
      supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('file_uploads' as any).select('*').order('created_at', { ascending: false }).limit(200),
    ]);

    // Merge both sources
    const allFiles: FileUpload[] = [];

    // Map legacy docs
    (legacyDocs || []).forEach((d: any) => {
      allFiles.push({
        id: d.id,
        file_name: d.file_name,
        file_path: d.file_path,
        file_size: d.file_size || 0,
        mime_type: d.mime_type || '',
        file_extension: '.' + (d.file_name?.split('.').pop() || ''),
        uploaded_by: d.uploaded_by,
        entity_type: d.entity_type,
        entity_id: d.entity_id,
        bucket_name: 'documents', // legacy bucket
        scan_status: 'clean',
        access_count: 0,
        created_at: d.created_at,
      });
    });

    // Map new uploads
    (uploads || []).forEach((u: any) => {
      allFiles.push({
        id: u.id,
        file_name: u.file_name,
        file_path: u.file_path,
        file_size: u.file_size,
        mime_type: u.mime_type,
        file_extension: u.file_extension,
        uploaded_by: u.uploaded_by,
        entity_type: u.entity_type,
        entity_id: u.entity_id,
        bucket_name: u.bucket_name,
        scan_status: u.scan_status,
        access_count: u.access_count,
        created_at: u.created_at,
        metadata: u.metadata || null,
      });
    });

    // Sort by date desc
    allFiles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Resolve emails
    const userIds = [...new Set(allFiles.map(f => f.uploaded_by))];
    if (userIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', userIds);
      const emailMap: Record<string, string> = {};
      profiles?.forEach(p => { emailMap[p.id] = p.email; });
      allFiles.forEach(f => { f.uploader_email = emailMap[f.uploaded_by] || 'Unknown'; });
    }

    setFiles(allFiles);
    setLoading(false);
  };

  useEffect(() => { loadFiles(); }, []);

  const handleDownload = async (file: FileUpload) => {
    if (file.bucket_name === 'secure-documents') {
      const ok = await secureDownload(file.file_path, file.file_name);
      if (!ok) toast.error('Download failed');
      else toast.success('Downloaded securely via signed URL');
    } else {
      // Legacy: direct download from public-ish bucket
      const { data, error } = await supabase.storage.from(file.bucket_name).download(file.file_path);
      if (error || !data) { toast.error('Download failed'); return; }
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handlePreview = async (file: FileUpload) => {
    if (file.bucket_name === 'secure-documents') {
      const { url, error } = await getSignedUrl(file.file_path, 300);
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.error('Cannot generate preview URL');
      }
    } else {
      const { data } = supabase.storage.from(file.bucket_name).getPublicUrl(file.file_path);
      if (data?.publicUrl) window.open(data.publicUrl, '_blank');
    }
  };

  const handleDelete = async (file: FileUpload) => {
    if (file.bucket_name === 'secure-documents') {
      const ok = await secureDelete(file.id, file.file_path);
      if (ok) { toast.success('File deleted'); loadFiles(); }
      else toast.error('Delete failed');
    } else {
      await supabase.storage.from(file.bucket_name).remove([file.file_path]);
      await supabase.from('documents').delete().eq('id', file.id);
      toast.success('File deleted');
      loadFiles();
    }
  };

  const handleReplaceClick = (file: FileUpload) => {
    if (file.bucket_name !== 'secure-documents') {
      toast.error('Replace is only available for secure uploaded documents.');
      return;
    }
    setReplaceTarget(file);
    replaceInputRef.current?.click();
  };

  const handleReplaceSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replaceTarget || !user) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error || 'Invalid file');
      e.target.value = '';
      return;
    }

    const result = await replaceSecureUpload(file, {
      fileUploadId: replaceTarget.id,
      existingFilePath: replaceTarget.file_path,
      userId: user.id,
      entityType: replaceTarget.entity_type,
      entityId: replaceTarget.entity_id,
      existingMetadata: replaceTarget.metadata,
    });

    if (result.success) {
      toast.success('Document replaced');
      await loadFiles();
    } else {
      toast.error(result.error || 'Replace failed');
    }

    setReplaceTarget(null);
    e.target.value = '';
  };

  const handleReviewAction = async (file: FileUpload, reviewStatus: 'verified' | 'rejected') => {
    if (file.bucket_name !== 'secure-documents') {
      toast.error('Review actions are only available for secure uploaded documents.');
      return;
    }

    const result = await Swal.fire({
      title: reviewStatus === 'verified' ? 'Verify document?' : 'Reject document?',
      input: 'textarea',
      inputLabel: reviewStatus === 'verified' ? 'Comments (optional)' : 'Reason',
      inputPlaceholder: reviewStatus === 'verified' ? 'Add verification notes...' : 'Explain why this document is being rejected...',
      inputValue: String(file.metadata?.review_comments || ''),
      inputAttributes: { 'aria-label': 'Document review comments' },
      icon: reviewStatus === 'verified' ? 'question' : 'warning',
      showCancelButton: true,
      confirmButtonText: reviewStatus === 'verified' ? 'Verify' : 'Reject',
      preConfirm: (value) => {
        if (reviewStatus === 'rejected' && !String(value || '').trim()) {
          Swal.showValidationMessage('A rejection reason is required.');
        }
        return value;
      },
    });

    if (!result.isConfirmed || !user) return;

    const nextMetadata = {
      ...(file.metadata || {}),
      review_status: reviewStatus,
      review_comments: String(result.value || '').trim() || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    };

    const { error } = await supabase
      .from('file_uploads' as any)
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() } as any)
      .eq('id', file.id);

    if (error) {
      toast.error(error.message || 'Review update failed');
      return;
    }

    toast.success(reviewStatus === 'verified' ? 'Document verified' : 'Document rejected');
    await loadFiles();
  };

  const filtered = files.filter(f =>
    f.file_name.toLowerCase().includes(search.toLowerCase()) ||
    f.entity_type.toLowerCase().includes(search.toLowerCase()) ||
    (f.uploader_email || '').toLowerCase().includes(search.toLowerCase())
  );

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <input
          ref={replaceInputRef}
          type="file"
          className="hidden"
          accept={ACCEPT_STRING}
          onChange={handleReplaceSelected}
        />
        <PageHeader
          title="Document Store"
          description="Browse and manage all uploaded documents. Files are stored in private storage with signed URL access."
        />

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search documents..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-success" />
                <span>Private storage · Time-limited signed URLs</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No documents found</TableCell></TableRow>
                  ) : filtered.map(file => (
                    <TableRow key={`${file.bucket_name}-${file.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{file.file_name}</p>
                          <p className="text-xs text-muted-foreground">{file.mime_type}</p>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{file.entity_type}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatFileSize(file.file_size)}</TableCell>
                      <TableCell>
                        <Badge variant={file.bucket_name === 'secure-documents' ? 'default' : 'secondary'} className="text-xs">
                          {file.bucket_name === 'secure-documents' ? '🔒 Private' : 'Legacy'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{file.uploader_email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(file.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <RowActionsMenu actions={[
                          { label: 'Preview', icon: Eye, onClick: () => handlePreview(file) },
                          { label: 'Download', icon: Download, onClick: () => handleDownload(file) },
                          { label: 'Replace', icon: RefreshCcw, onClick: () => handleReplaceClick(file), hidden: !(file.bucket_name === 'secure-documents' && (isAdmin || file.uploaded_by === user?.id)) },
                          { label: 'Verify', icon: CheckCircle2, onClick: () => handleReviewAction(file, 'verified'), hidden: !(file.bucket_name === 'secure-documents' && isAdmin) },
                          { label: 'Reject', icon: XCircle, onClick: () => handleReviewAction(file, 'rejected'), destructive: true, hidden: !(file.bucket_name === 'secure-documents' && isAdmin) },
                          { label: 'Delete', icon: Trash2, onClick: () => handleDelete(file), destructive: true, hidden: !(isAdmin || file.uploaded_by === user?.id), separator: true },
                        ]} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
