import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Trash2, AlertCircle, Image, File, Eye, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { DocumentMeta } from '@/hooks/useRegistrationForm';
import Swal from 'sweetalert2';
import {
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_ALLOWED_MIME_TYPES,
  isAllowedFile,
} from '@/lib/fileValidation';

interface DocTypeConfig {
  label: string;
  required: boolean;
  allowedTypes: string[];
  maxSizeMB: number;
}

interface Props {
  documents: DocumentMeta[];
  onAddDocument: (doc: DocumentMeta) => void;
  onRemoveDocument: (docId: string) => void;
  errors: Record<string, string>;
  documentTypes?: DocTypeConfig[];
}

const DEFAULT_ALLOWED_TYPES = DEFAULT_ALLOWED_MIME_TYPES;
const DEFAULT_MAX_SIZE_MB = 5;

const DEFAULT_DOCUMENT_LABELS = [
  'Certificate of Incorporation',
  'Business Registration Certificate',
  'Tax Identification Certificate',
  'Board Resolution',
  'Proof of Capital/Financial Statements',
  'ID of Principal Officers',
  'Other Supporting Document',
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />;
  if (type.startsWith('image/')) return <Image className="h-5 w-5 text-blue-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function documentKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '_');
}

export function DocumentsStep({ documents, onAddDocument, onRemoveDocument, errors, documentTypes }: Props) {
  const labels = documentTypes ? documentTypes.map(d => d.label) : DEFAULT_DOCUMENT_LABELS;
  const maxSizeMB = documentTypes?.[0]?.maxSizeMB ?? DEFAULT_MAX_SIZE_MB;
  const allowedTypes = DEFAULT_ALLOWED_TYPES;
  const allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS;

  const [uploading, setUploading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(labels[0]);
  const [replaceMode, setReplaceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedConfig = documentTypes?.find(d => d.label === selectedLabel);
  const selectedKey = documentKey(selectedLabel || labels[0] || 'document');
  const existingDoc = documents.find(d => (d.documentKey || documentKey(d.label)) === selectedKey);

  useEffect(() => {
    if (!labels.includes(selectedLabel)) setSelectedLabel(labels[0]);
  }, [labels, selectedLabel]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (existingDoc && !replaceMode) {
      toast.warning('Only one active file is allowed for this document type. Use Replace to upload a new file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const effectiveAllowedTypes = selectedConfig?.allowedTypes?.length ? selectedConfig.allowedTypes : allowedTypes;
    const effectiveMaxSizeMB = selectedConfig?.maxSizeMB ?? maxSizeMB;
    const effectiveMaxSizeBytes = effectiveMaxSizeMB * 1024 * 1024;

    const validation = isAllowedFile(file, {
      allowedTypes: effectiveAllowedTypes,
      maxSizeBytes: effectiveMaxSizeBytes,
    });
    if (!validation.valid) {
      toast.error(validation.error || `Invalid file type. Allowed: ${allowedExtensions.join(', ')}`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const filePath = `registrations/${crypto.randomUUID()}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('secure-documents')
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) {
        toast.error('Upload failed: ' + uploadError.message);
        return;
      }

      const doc: DocumentMeta = {
        id: existingDoc?.id || crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        path: filePath,
        label: selectedLabel,
        documentKey: selectedKey,
      };

      if (existingDoc?.path) {
        await supabase.storage.from('secure-documents').remove([existingDoc.path]);
      }
      onAddDocument(doc);
      setReplaceMode(false);
      toast.success(`${file.name} uploaded successfully`);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async (doc: DocumentMeta) => {
    const result = await Swal.fire({
      title: 'Remove this document?',
      text: doc.name,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#dc2626',
    });
    if (!result.isConfirmed) return;
    try {
      await supabase.storage.from('secure-documents').remove([doc.path]);
    } catch {}
    onRemoveDocument(doc.id);
    setReplaceMode(false);
    toast.info(`${doc.name} removed`);
  };

  const handleReplace = async () => {
    if (!existingDoc) return;
    const result = await Swal.fire({
      title: 'Replace existing document?',
      text: `Uploading a new file will replace ${existingDoc.name}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Replace',
    });
    if (!result.isConfirmed) return;
    setReplaceMode(true);
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const openSignedUrl = async (doc: DocumentMeta, download = false) => {
    const { data, error } = await supabase.storage.from('secure-documents').createSignedUrl(doc.path, 300);
    if (error || !data?.signedUrl) {
      toast.error('Unable to open document');
      return;
    }
    const a = window.document.createElement('a');
    a.href = data.signedUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (download) a.download = doc.name;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground">Supporting Documents</h3>
        <p className="text-sm text-muted-foreground">
          Upload supporting documents for your registration. Accepted formats: PDF, JPG, PNG (max 5MB each).
        </p>

        {/* Upload area */}
        <div className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Document Type</Label>
              <select
                value={selectedLabel}
                onChange={e => { setSelectedLabel(e.target.value); setReplaceMode(false); }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {labels.map(label => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>File</Label>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="doc-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || (!!existingDoc && !replaceMode)}
                >
                  {uploading ? (
                    <>Uploading...</>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Choose File
                    </>
                  )}
                </Button>
              </div>
              {existingDoc && !replaceMode && (
                <p className="text-xs text-muted-foreground">A file is already attached for this document type.</p>
              )}
            </div>
          </div>

          {existingDoc && (
            <div className="rounded-lg border border-border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
              <div className="flex items-center gap-3 min-w-0">
                {getFileIcon(existingDoc.type)}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{existingDoc.name}</p>
                  <p className="text-xs text-muted-foreground">{existingDoc.label} • {formatSize(existingDoc.size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" size="sm" variant="outline" onClick={() => openSignedUrl(existingDoc)}><Eye className="h-4 w-4 mr-1" />View</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => openSignedUrl(existingDoc, true)}><Download className="h-4 w-4 mr-1" />Download</Button>
                <Button type="button" size="sm" variant="outline" onClick={handleReplace}><RefreshCw className="h-4 w-4 mr-1" />Replace</Button>
                <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleRemove(existingDoc)}><Trash2 className="h-4 w-4 mr-1" />Remove</Button>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border p-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p>Accepted formats: PDF, JPG, PNG • Maximum file size: 5MB</p>
              <p>Documents are stored securely and encrypted at rest.</p>
            </div>
          </div>
        </div>

        {/* Uploaded documents list */}
        {documents.length > 0 && (
          <div className="mt-6 space-y-2">
            <Label className="text-sm font-medium">Uploaded Documents ({documents.length})</Label>
            <div className="divide-y divide-border rounded-lg border border-border">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    {getFileIcon(doc.type)}
                    <div>
                      <p className="text-sm font-medium text-foreground">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.label} • {formatSize(doc.size)}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(doc)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {documents.length === 0 && (
          <div className="mt-6 rounded-lg border-2 border-dashed border-border p-8 text-center">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
            <p className="text-xs text-muted-foreground mt-1">Upload supporting documents using the form above</p>
          </div>
        )}
      </div>
    </div>
  );
}
