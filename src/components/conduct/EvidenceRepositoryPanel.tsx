import { useState } from 'react';
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
import { toast } from 'sonner';
import { Lock, LockOpen, Upload, Eye, Loader2, FileText } from 'lucide-react';
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
  const [form, setForm] = useState({
    title: '', evidence_type: 'document', description: '',
    source: '', file_url: '', restricted: false, confidentiality_level: 'internal',
  });

  const submit = async () => {
    if (!form.title.trim()) { toast.error('Title required'); return; }
    await upload.mutateAsync({ ...form, ...filter });
    setForm({ title: '', evidence_type: 'document', description: '', source: '', file_url: '', restricted: false, confidentiality_level: 'internal' });
    setOpen(false);
    refetch();
  };

  const view = async (row: ConductEvidence) => {
    if (!row.file_url) { toast.error('No file URL on this evidence item'); return; }
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
    window.open(row.file_url, '_blank', 'noopener');
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
        <Button size="sm" onClick={() => setOpen(true)}><Upload className="h-4 w-4 mr-1" />Upload</Button>
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
            <div><Label>File URL</Label><Input placeholder="https://…" value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })} /></div>
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
            <Button onClick={submit} disabled={upload.isPending} className="w-full">{upload.isPending ? 'Uploading…' : 'Upload'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default EvidenceRepositoryPanel;
