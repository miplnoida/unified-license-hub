import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import {
  useEvidence, useUploadEvidence, useToggleEvidenceRestriction,
  logEvidenceAccess, logEvidenceAccessDenied, type ConductEvidence,
} from '@/hooks/useMarketConduct';
import { validateFile, ACCEPT_STRING, MAX_FILE_SIZE } from '@/lib/secureFileUpload';
import { toast } from 'sonner';
import { Lock, LockOpen, Upload, Eye, Loader2, FileText, X, Plus } from 'lucide-react';
import Swal from 'sweetalert2';

interface Props {
  entityId?: string;
  complaintId?: string;
  investigationId?: string;
  thematicReviewId?: string;
  title?: string;
}


const TYPES = ['document', 'email', 'call_transcript', 'system_log', 'screenshot', 'contract', 'other'];
const CONF = ['public', 'internal', 'restricted', 'confidential'];

/**
 * Reusable evidence repository panel. RLS on `conduct_evidence` hides restricted
 * rows from users without the internal/admin role — the panel additionally
 * logs a `denied` event when a supervisor with list access opens a restricted
 * URL they cannot actually retrieve.
 */
export function EvidenceRepositoryPanel({ entityId, complaintId, investigationId, thematicReviewId, title = 'Evidence' }: Props) {
  const filter = {
    entity_id: entityId, complaint_id: complaintId,
    investigation_id: investigationId, thematic_review_id: thematicReviewId,
  };
  const { data, isLoading, refetch } = useEvidence(filter);
  const upload = useUploadEvidence();
  const toggle = useToggleEvidenceRestriction();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const emptyForm = {
    title: '', evidence_type: 'document', description: '',
    source: '', restricted: false, confidentiality_level: 'internal',
  };
  const [form, setForm] = useState(emptyForm);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const v = validateFile(f);
    if (!v.valid) { toast.error(v.error || 'Invalid file'); return; }
    setFile(f);
    if (!form.title.trim()) setForm(prev => ({ ...prev, title: f.name.replace(/\.[^.]+$/, '') }));
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    if (!form.title.trim()) { toast.error('Title required'); return; }
    if (!file) { toast.error('Please select a file to upload'); return; }
    setUploading(true);
    try {
      const scope = entityId ? `entity/${entityId}` :
                    complaintId ? `complaint/${complaintId}` :
                    investigationId ? `investigation/${investigationId}` :
                    thematicReviewId ? `thematic/${thematicReviewId}` : 'misc';
      const safeName = file.name.replace(/[^\w.-]+/g, '_');
      const path = `conduct-evidence/${scope}/${Date.now()}-${safeName}`;
      const { error: upErr } = await (supabase as any).storage.from('fp-evidence').upload(path, file, {
        contentType: file.type || 'application/octet-stream', upsert: false,
      });
      if (upErr) throw new Error(upErr.message);
      await upload.mutateAsync({
        ...form, ...filter,
        file_url: path,
        metadata: { storage_bucket: 'fp-evidence', storage_path: path, original_name: file.name, size: file.size, mime: file.type } as any,
      });
      setForm(emptyForm);
      setFile(null);
      setOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const view = async (row: ConductEvidence) => {
    if (!row.file_url) { toast.error('No file attached to this evidence item'); return; }
    // Re-check readability under RLS — if row is restricted and user cannot
    // fetch it via a fresh select, treat as denied access.
    const { data: verify, error } = await (supabase as any)
      .from('conduct_evidence').select('id, file_url').eq('id', row.id).maybeSingle();
    if (error || !verify) {
      await logEvidenceAccessDenied(row.id, 'RLS blocked read on view');
      toast.error('Access denied — this evidence is restricted.');
      return;
    }
    await logEvidenceAccess(row.id, 'view', row.restricted ? 'restricted-view' : null);
    // If it looks like a full URL, open directly; otherwise treat as a storage path.
    if (/^https?:\/\//i.test(row.file_url)) {
      window.open(row.file_url, '_blank', 'noopener');
      return;
    }
    const { data: signed, error: signErr } = await (supabase as any).storage
      .from('fp-evidence').createSignedUrl(row.file_url, 300);
    if (signErr || !signed?.signedUrl) { toast.error('Could not generate download link'); return; }
    window.open(signed.signedUrl, '_blank', 'noopener');
  };


  const toggleRestriction = async (row: ConductEvidence) => {
    const res = await Swal.fire({
      title: row.restricted ? 'Remove restriction?' : 'Restrict evidence?',
      input: 'textarea',
      inputLabel: 'Reason (required, min 10 chars)',
      inputValidator: (v) => (!v || v.trim().length < 10) ? 'Reason required (min 10 chars)' : null,
      showCancelButton: true,
      confirmButtonText: row.restricted ? 'Unrestrict' : 'Restrict',
    });
    if (!res.isConfirmed) return;
    await toggle.mutateAsync({ id: row.id, restricted: !row.restricted, reason: res.value });
    refetch();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />{title}</CardTitle>
        <Button data-rbac="market_conduct.edit" size="sm" onClick={() => setOpen(true)}><Upload className="h-4 w-4 mr-1" />Upload</Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Confidentiality</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No evidence recorded.</TableCell></TableRow>
              )}
              {(data ?? []).map(row => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    {row.restricted && <Lock className="h-3 w-3 text-destructive" aria-label="Restricted" />}
                    {row.title}
                  </TableCell>
                  <TableCell><Badge variant="outline">{row.evidence_type}</Badge></TableCell>
                  <TableCell><Badge variant={row.restricted ? 'destructive' : 'secondary'} className="capitalize">{row.confidentiality_level}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(row.uploaded_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => view(row)} disabled={!row.file_url}><Eye className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleRestriction(row)}>
                      {row.restricted ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload evidence</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.evidence_type} onValueChange={v => setForm({ ...form, evidence_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>File *</Label>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept={ACCEPT_STRING}
                onChange={pickFile}
              />
              {file ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)} type="button">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button data-rbac="market_conduct.edit" variant="outline" size="sm" type="button" onClick={() => fileRef.current?.click()}>
                  <Plus className="h-4 w-4 mr-1" />Select file
                </Button>
              )}
              <p className="text-xs text-muted-foreground mt-1">Max {MAX_FILE_SIZE / (1024 * 1024)}MB · stored privately</p>
            </div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Source</Label><Input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="e.g. licensee submission" /></div>
            <div>
              <Label>Confidentiality</Label>
              <Select value={form.confidentiality_level} onValueChange={v => setForm({ ...form, confidentiality_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONF.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Restricted (internal admin only)</Label>
              <Switch checked={form.restricted} onCheckedChange={v => setForm({ ...form, restricted: v })} />
            </div>
            <Button onClick={submit} disabled={upload.isPending || uploading} className="w-full">{(upload.isPending || uploading) ? 'Uploading…' : 'Upload'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default EvidenceRepositoryPanel;
