import { useEffect, useMemo, useRef, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { validateFile, ACCEPT_STRING, MAX_FILE_SIZE } from '@/lib/secureFileUpload';
import {
  useCreateInterview, useUpdateInterview, useFinaliseInterview, useAmendInterview,
  useInterviewParticipants, useAddParticipant, useRemoveParticipant,
  useInterviewAttachments, useAddInterviewAttachment, usePromoteAttachmentToEvidence,
  signedInterviewFileUrl, type ConductInterview,
} from '@/hooks/useConductInterviews';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { Loader2, Plus, Trash2, Upload, Eye, ShieldCheck, FileText, X, Lock } from 'lucide-react';

const TYPES = ['in_person', 'virtual', 'telephone', 'written'];
const PARTICIPANT_TYPES = ['interviewer', 'observer', 'legal_representative', 'interpreter', 'other'];

interface Props {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investigationId: string;
  entityId?: string | null;
  interview?: ConductInterview;
}

const emptyForm = {
  interviewee_name: '', interviewee_role: '', interviewee_organisation: '',
  contact_email: '', contact_phone: '', interview_type: 'in_person',
  location: '', scheduled_at: '', started_at: '', ended_at: '', purpose: '',
  key_information: '', topics_covered: '', admissions: '', follow_up_actions: '',
  status: 'scheduled',
};

function toLocalInput(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function InterviewRecordDialog({ mode, open, onOpenChange, investigationId, entityId, interview }: Props) {
  const create = useCreateInterview();
  const update = useUpdateInterview();
  const finalise = useFinaliseInterview();
  const amend = useAmendInterview();
  const [form, setForm] = useState({ ...emptyForm });
  const locked = !!interview?.finalised_at;

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && interview) {
      setForm({
        interviewee_name: interview.interviewee_name ?? '',
        interviewee_role: interview.interviewee_role ?? '',
        interviewee_organisation: interview.interviewee_organisation ?? '',
        contact_email: interview.contact_email ?? '',
        contact_phone: interview.contact_phone ?? '',
        interview_type: interview.interview_type ?? 'in_person',
        location: interview.location ?? '',
        scheduled_at: toLocalInput(interview.scheduled_at),
        started_at: toLocalInput(interview.started_at),
        ended_at: toLocalInput(interview.ended_at),
        purpose: interview.purpose ?? '',
        key_information: interview.key_information ?? '',
        topics_covered: interview.topics_covered ?? '',
        admissions: interview.admissions ?? '',
        follow_up_actions: interview.follow_up_actions ?? '',
        status: interview.status ?? 'scheduled',
      });
    } else {
      setForm({ ...emptyForm });
    }
  }, [open, mode, interview?.id]);

  const payload = useMemo(() => ({
    interviewee_name: form.interviewee_name.trim(),
    interviewee_role: form.interviewee_role.trim() || null,
    interviewee_organisation: form.interviewee_organisation.trim() || null,
    contact_email: form.contact_email.trim() || null,
    contact_phone: form.contact_phone.trim() || null,
    interview_type: form.interview_type as any,
    location: form.location.trim() || null,
    scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    started_at: form.started_at ? new Date(form.started_at).toISOString() : null,
    ended_at: form.ended_at ? new Date(form.ended_at).toISOString() : null,
    purpose: form.purpose.trim() || null,
    key_information: form.key_information.trim() || null,
    topics_covered: form.topics_covered.trim() || null,
    admissions: form.admissions.trim() || null,
    follow_up_actions: form.follow_up_actions.trim() || null,
    status: form.status as any,
  }), [form]);

  const save = async () => {
    if (!payload.interviewee_name) { toast.error('Interviewee name is required'); return; }
    if (payload.started_at && payload.ended_at && payload.ended_at < payload.started_at) {
      toast.error('End time cannot be before start time'); return;
    }
    if (mode === 'create') {
      await create.mutateAsync({ ...payload, investigation_id: investigationId, licensee_id: entityId ?? null } as any);
      onOpenChange(false);
      return;
    }
    if (!interview) return;
    if (locked) {
      const res = await Swal.fire({
        title: 'Amend finalised record?',
        input: 'textarea',
        inputLabel: 'Justification (required, min 10 chars)',
        inputValidator: v => (!v || v.trim().length < 10) ? 'Justification required (min 10 chars)' : null,
        showCancelButton: true, confirmButtonText: 'Record amendment',
      });
      if (!res.isConfirmed) return;
      await amend.mutateAsync({
        id: interview.id,
        patch: {
          key_information: payload.key_information ?? '',
          topics_covered: payload.topics_covered ?? '',
          admissions: payload.admissions ?? '',
          follow_up_actions: payload.follow_up_actions ?? '',
        },
        justification: res.value,
      });
      return;
    }
    await update.mutateAsync({ id: interview.id, patch: payload as any });
  };

  const cancelInterview = async () => {
    if (!interview) return;
    const res = await Swal.fire({
      title: 'Cancel this interview?',
      input: 'textarea',
      inputLabel: 'Reason (required, min 10 chars)',
      inputValidator: v => (!v || v.trim().length < 10) ? 'Reason required (min 10 chars)' : null,
      showCancelButton: true, confirmButtonText: 'Cancel interview',
    });
    if (!res.isConfirmed) return;
    await update.mutateAsync({
      id: interview.id,
      patch: { status: 'cancelled', cancellation_reason: res.value } as any,
      justification: res.value,
    });
    onOpenChange(false);
  };

  const busy = create.isPending || update.isPending || amend.isPending || finalise.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'create' ? 'New interview record' : `Interview — ${interview?.interviewee_name}`}
            {locked && <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />Finalised</Badge>}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="record">Record</TabsTrigger>
            {mode === 'edit' && <TabsTrigger value="people">People present</TabsTrigger>}
            {mode === 'edit' && <TabsTrigger value="documents">Documents</TabsTrigger>}
            {mode === 'edit' && <TabsTrigger value="attestation">Signature</TabsTrigger>}
          </TabsList>

          <TabsContent value="details" className="space-y-3 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Interviewee name *</Label><Input disabled={locked} value={form.interviewee_name} onChange={e => setForm({ ...form, interviewee_name: e.target.value })} maxLength={200} /></div>
              <div><Label>Role / designation</Label><Input disabled={locked} value={form.interviewee_role} onChange={e => setForm({ ...form, interviewee_role: e.target.value })} maxLength={200} /></div>
              <div><Label>Organisation</Label><Input disabled={locked} value={form.interviewee_organisation} onChange={e => setForm({ ...form, interviewee_organisation: e.target.value })} maxLength={200} /></div>
              <div>
                <Label>Interview type</Label>
                <Select value={form.interview_type} onValueChange={v => setForm({ ...form, interview_type: v })} disabled={locked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Email</Label><Input disabled={locked} type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} maxLength={255} /></div>
              <div><Label>Phone</Label><Input disabled={locked} value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} maxLength={40} /></div>
              <div><Label>Location / platform</Label><Input disabled={locked} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} maxLength={255} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })} disabled={locked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="conducted">Conducted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Scheduled at</Label><Input disabled={locked} type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} /></div>
              <div><Label>Started at</Label><Input disabled={locked} type="datetime-local" value={form.started_at} onChange={e => setForm({ ...form, started_at: e.target.value })} /></div>
              <div><Label>Ended at</Label><Input disabled={locked} type="datetime-local" value={form.ended_at} onChange={e => setForm({ ...form, ended_at: e.target.value })} /></div>
            </div>
            <div><Label>Purpose</Label><Textarea disabled={locked} rows={2} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} /></div>
          </TabsContent>

          <TabsContent value="record" className="space-y-3 pt-3">
            <div><Label>Key information obtained {locked ? '' : '*'}</Label><Textarea rows={6} value={form.key_information} onChange={e => setForm({ ...form, key_information: e.target.value })} /></div>
            <div><Label>Questions / topics covered</Label><Textarea rows={3} value={form.topics_covered} onChange={e => setForm({ ...form, topics_covered: e.target.value })} /></div>
            <div><Label>Admissions or denials noted</Label><Textarea rows={3} value={form.admissions} onChange={e => setForm({ ...form, admissions: e.target.value })} /></div>
            <div><Label>Follow-up actions required</Label><Textarea rows={3} value={form.follow_up_actions} onChange={e => setForm({ ...form, follow_up_actions: e.target.value })} /></div>
            {locked && (interview?.amendments?.length ?? 0) > 0 && (
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-medium">Amendment history</p>
                {interview!.amendments.map((a, i) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    {new Date(a.amended_at).toLocaleString()} — {a.justification}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {mode === 'edit' && interview && (
            <TabsContent value="people" className="pt-3">
              <ParticipantsSection interviewId={interview.id} locked={locked} />
            </TabsContent>
          )}

          {mode === 'edit' && interview && (
            <TabsContent value="documents" className="pt-3">
              <DocumentsSection interview={interview} investigationId={investigationId} entityId={entityId} />
            </TabsContent>
          )}

          {mode === 'edit' && interview && (
            <TabsContent value="attestation" className="pt-3">
              <AttestationSection interview={interview} onDone={() => onOpenChange(false)} />
            </TabsContent>
          )}
        </Tabs>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <div>
            {mode === 'edit' && !locked && interview?.status !== 'cancelled' && (
              <GuardedButton module="market_conduct" action="manage_complaints" data-rbac="market_conduct.manage_complaints" variant="ghost" className="text-destructive" onClick={cancelInterview} disabled={busy}>Cancel interview</GuardedButton>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button data-rbac="market_conduct.edit" onClick={save} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {mode === 'create' ? 'Create record' : locked ? 'Record amendment' : 'Save record'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Participants ----------------
function ParticipantsSection({ interviewId, locked }: { interviewId: string; locked: boolean }) {
  const { data, isLoading } = useInterviewParticipants(interviewId);
  const add = useAddParticipant();
  const remove = useRemoveParticipant();
  const [row, setRow] = useState({ name: '', role: '', organisation: '', participant_type: 'interviewer' });

  const submit = async () => {
    if (!row.name.trim()) { toast.error('Name is required'); return; }
    await add.mutateAsync({
      interview_id: interviewId,
      name: row.name.trim(),
      role: row.role.trim() || null,
      organisation: row.organisation.trim() || null,
      participant_type: row.participant_type as any,
    });
    setRow({ name: '', role: '', organisation: '', participant_type: 'interviewer' });
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Role</TableHead><TableHead>Organisation</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No participants recorded.</TableCell></TableRow>
            )}
            {(data ?? []).map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{p.participant_type.replace(/_/g, ' ')}</Badge></TableCell>
                <TableCell>{p.role || '—'}</TableCell>
                <TableCell>{p.organisation || '—'}</TableCell>
                <TableCell className="text-right">
                  {!locked && (
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate({ id: p.id, interview_id: interviewId })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {!locked && (
        <div className="grid gap-2 sm:grid-cols-5 items-end border-t pt-3">
          <div><Label className="text-xs">Name</Label><Input value={row.name} onChange={e => setRow({ ...row, name: e.target.value })} maxLength={200} /></div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={row.participant_type} onValueChange={v => setRow({ ...row, participant_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PARTICIPANT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Role</Label><Input value={row.role} onChange={e => setRow({ ...row, role: e.target.value })} maxLength={200} /></div>
          <div><Label className="text-xs">Organisation</Label><Input value={row.organisation} onChange={e => setRow({ ...row, organisation: e.target.value })} maxLength={200} /></div>
          <Button data-rbac="market_conduct.edit" size="sm" onClick={submit} disabled={add.isPending}>
            <Plus className="h-4 w-4 mr-1" />Add
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------- Documents ----------------
function DocumentsSection({ interview, investigationId, entityId }: {
  interview: ConductInterview; investigationId: string; entityId?: string | null;
}) {
  const { data, isLoading } = useInterviewAttachments(interview.id);
  const addAttachment = useAddInterviewAttachment();
  const promote = usePromoteAttachmentToEvidence();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ title: '', exhibit_reference: '', produced_by_interviewee: false });
  const [uploading, setUploading] = useState(false);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const v = validateFile(f);
    if (!v.valid) { toast.error(v.error || 'Invalid file'); return; }
    setFile(f);
    if (!meta.title.trim()) setMeta(m => ({ ...m, title: f.name.replace(/\.[^.]+$/, '') }));
    if (fileRef.current) fileRef.current.value = '';
  };

  const upload = async () => {
    if (!file) { toast.error('Select a file first'); return; }
    if (!meta.title.trim()) { toast.error('Title is required'); return; }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, '_');
      const path = `conduct-interviews/${interview.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await (supabase as any).storage.from('fp-evidence').upload(path, file, {
        contentType: file.type || 'application/octet-stream', upsert: false,
      });
      if (upErr) throw new Error(upErr.message);
      await addAttachment.mutateAsync({
        interview_id: interview.id,
        title: meta.title.trim(),
        file_url: path,
        storage_bucket: 'fp-evidence',
        file_name: file.name,
        size_bytes: file.size,
        mime_type: file.type || null,
        exhibit_reference: meta.exhibit_reference.trim() || null,
        produced_by_interviewee: meta.produced_by_interviewee,
      });
      setFile(null);
      setMeta({ title: '', exhibit_reference: '', produced_by_interviewee: false });
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const view = async (bucket: string | null, path: string | null) => {
    const url = await signedInterviewFileUrl(bucket, path);
    if (!url) { toast.error('Could not generate download link'); return; }
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead><TableHead>Exhibit</TableHead><TableHead>Source</TableHead>
              <TableHead>Uploaded</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No documents produced during this interview.</TableCell></TableRow>
            )}
            {(data ?? []).map(a => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.file_name} {a.size_bytes ? `· ${(a.size_bytes / 1024).toFixed(1)} KB` : ''}</div>
                </TableCell>
                <TableCell>{a.exhibit_reference || '—'}</TableCell>
                <TableCell>
                  <Badge variant={a.produced_by_interviewee ? 'default' : 'secondary'}>
                    {a.produced_by_interviewee ? 'Interviewee' : 'Regulator'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => view(a.storage_bucket, a.file_url)} disabled={!a.file_url}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {a.evidence_id ? (
                    <Badge variant="outline" className="text-[10px]">In evidence</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" title="Add to evidence repository"
                      onClick={() => promote.mutate({ attachment: a, investigationId, entityId })}
                      disabled={promote.isPending}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="space-y-2 border-t pt-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div><Label className="text-xs">Title *</Label><Input value={meta.title} onChange={e => setMeta({ ...meta, title: e.target.value })} maxLength={200} /></div>
          <div><Label className="text-xs">Exhibit reference</Label><Input value={meta.exhibit_reference} onChange={e => setMeta({ ...meta, exhibit_reference: e.target.value })} maxLength={60} /></div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={meta.produced_by_interviewee} onCheckedChange={v => setMeta({ ...meta, produced_by_interviewee: v })} />
          <Label className="text-xs">Produced by the interviewee</Label>
        </div>
        <input ref={fileRef} type="file" className="hidden" accept={ACCEPT_STRING} onChange={pick} />
        {file ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)} type="button"><X className="h-3 w-3" /></Button>
          </div>
        ) : (
          <Button data-rbac="market_conduct.edit" variant="outline" size="sm" type="button" onClick={() => fileRef.current?.click()}>
            <Plus className="h-4 w-4 mr-1" />Select file
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button data-rbac="market_conduct.edit" size="sm" onClick={upload} disabled={uploading || !file}>
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}Upload document
          </Button>
          <span className="text-xs text-muted-foreground">Max {MAX_FILE_SIZE / (1024 * 1024)}MB · stored privately</span>
        </div>
      </div>
    </div>
  );
}

// ---------------- Attestation ----------------
function AttestationSection({ interview, onDone }: { interview: ConductInterview; onDone: () => void }) {
  const finalise = useFinaliseInterview();
  const [outcome, setOutcome] = useState<'signed' | 'refused' | 'not_required'>('signed');
  const [attestationName, setAttestationName] = useState('');
  const [refusalReason, setRefusalReason] = useState('');
  const [witness, setWitness] = useState('');

  if (interview.finalised_at) {
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />Finalised</Badge>
          <span className="text-muted-foreground">{new Date(interview.finalised_at).toLocaleString()}</span>
        </div>
        <div><span className="text-muted-foreground">Outcome:</span> <span className="capitalize">{interview.attestation_outcome.replace(/_/g, ' ')}</span></div>
        {interview.attestation_name && <div><span className="text-muted-foreground">Attested by:</span> {interview.attestation_name}</div>}
        {interview.attestation_at && <div><span className="text-muted-foreground">Signed at:</span> {new Date(interview.attestation_at).toLocaleString()}</div>}
        {interview.refusal_reason && <div><span className="text-muted-foreground">Refusal reason:</span> {interview.refusal_reason}</div>}
        {interview.refusal_witnessed_by && <div><span className="text-muted-foreground">Refusal witnessed by:</span> {interview.refusal_witnessed_by}</div>}
      </div>
    );
  }

  const submit = async () => {
    if (outcome === 'refused' && refusalReason.trim().length < 10) {
      toast.error('Refusal reason must be at least 10 characters'); return;
    }
    const res = await Swal.fire({
      title: 'Finalise interview record?',
      text: 'Once finalised the record is locked; later corrections require a justification.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Finalise',
    });
    if (!res.isConfirmed) return;
    await finalise.mutateAsync({
      id: interview.id,
      attestation_outcome: outcome,
      attestation_name: outcome === 'signed' ? attestationName.trim() : null,
      refusal_reason: outcome === 'refused' ? refusalReason.trim() : null,
      refusal_witnessed_by: outcome === 'refused' ? witness.trim() : null,
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Attestation outcome</Label>
        <Select value={outcome} onValueChange={v => setOutcome(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="signed">Signed by interviewee</SelectItem>
            <SelectItem value="refused">Refused to sign</SelectItem>
            <SelectItem value="not_required">Signature not required</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {outcome === 'signed' && (
        <div>
          <Label>Typed attestation name</Label>
          <Input value={attestationName} onChange={e => setAttestationName(e.target.value)} maxLength={200}
            placeholder={interview.interviewee_name} />
          <p className="text-xs text-muted-foreground mt-1">
            Provide the attestation name, or upload the signed copy under Documents.
          </p>
        </div>
      )}
      {outcome === 'refused' && (
        <>
          <div>
            <Label>Refusal reason *</Label>
            <Textarea rows={3} value={refusalReason} onChange={e => setRefusalReason(e.target.value)} />
          </div>
          <div>
            <Label>Refusal witnessed by</Label>
            <Input value={witness} onChange={e => setWitness(e.target.value)} maxLength={200} />
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Key information obtained must be captured before the record can be finalised.
      </p>
      <Button data-rbac="market_conduct.edit" onClick={submit} disabled={finalise.isPending}>
        {finalise.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Finalise record
      </Button>
    </div>
  );
}
