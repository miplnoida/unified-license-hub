import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Trash2, AlertCircle, Image, File } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { DocumentMeta } from '@/hooks/useRegistrationForm';

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

const DEFAULT_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const DEFAULT_ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
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

export function DocumentsStep({ documents, onAddDocument, onRemoveDocument, errors, documentTypes }: Props) {
  const labels = documentTypes ? documentTypes.map(d => d.label) : DEFAULT_DOCUMENT_LABELS;
  const maxSizeMB = documentTypes?.[0]?.maxSizeMB ?? DEFAULT_MAX_SIZE_MB;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const allowedTypes = DEFAULT_ALLOWED_TYPES;
  const allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS;

  const [uploading, setUploading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(labels[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!allowedTypes.includes(file.type)) {
      toast.error(`Invalid file type. Allowed: ${allowedExtensions.join(', ')}`);
      return;
    }

    if (file.size > maxSizeBytes) {
      toast.error(`File too large. Maximum size: ${maxSizeMB}MB`);
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
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        path: filePath,
        label: selectedLabel,
      };

      onAddDocument(doc);
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
    try {
      await supabase.storage.from('secure-documents').remove([doc.path]);
    } catch {}
    onRemoveDocument(doc.id);
    toast.info(`${doc.name} removed`);
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
                onChange={e => setSelectedLabel(e.target.value)}
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
                  disabled={uploading}
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
            </div>
          </div>

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
