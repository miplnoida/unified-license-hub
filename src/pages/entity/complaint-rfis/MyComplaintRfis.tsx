import { useMemo, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle2, Lock, Loader2, Paperclip, Save, Send, ShieldCheck } from 'lucide-react';

import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { secureUpload, validateFile, ACCEPT_STRING, MAX_FILE_SIZE } from '@/lib/secureFileUpload';
import { RfiAttachmentList } from '@/components/complaints/RfiAttachmentList';
import { formatDateTime, formatDateOnly } from '@/lib/datetime';
import {
  useMyComplaintRfis,
  useSaveComplaintRfiDraft,
  useSubmitComplaintRfi,
  type ComplaintRfi,
  type ComplaintRfiItem,
} from '@/hooks/useComplaintRfis';

const TYPE_LABEL: Record<string, string> = {
  text: 'Written answer required',
  document: 'Supporting document required',
  both: 'Written answer and document required',
};

export default function MyComplaintRfis() {
  const { data: rfis = [], isLoading, refetch } = useMyComplaintRfis();

  const outstanding = useMemo(() => rfis.filter((r) => r.status === 'open'), [rfis]);
  const submitted = useMemo(() => rfis.filter((r) => r.status === 'submitted'), [rfis]);
  const closed = useMemo(() => rfis.filter((r) => r.status === 'closed' || r.status === 'cancelled'), [rfis]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Information Requests"
          description="Respond to requests for information issued by the regulator on complaints involving your organisation."
        />

        {isLoading ? (
          <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>
        ) : (
          <Tabs defaultValue="outstanding">
            <TabsList>
              <TabsTrigger value="outstanding">Outstanding ({outstanding.length})</TabsTrigger>
              <TabsTrigger value="submitted">Submitted ({submitted.length})</TabsTrigger>
              <TabsTrigger value="closed">Closed ({closed.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="outstanding" className="space-y-4 pt-4">
              {outstanding.length === 0 && <EmptyState label="You have no outstanding information requests." />}
              {outstanding.map((r) => <RfiCard key={r.id} rfi={r} editable onChanged={refetch} />)}
            </TabsContent>
            <TabsContent value="submitted" className="space-y-4 pt-4">
              {submitted.length === 0 && <EmptyState label="Nothing awaiting regulator review." />}
              {submitted.map((r) => <RfiCard key={r.id} rfi={r} onChanged={refetch} />)}
            </TabsContent>
            <TabsContent value="closed" className="space-y-4 pt-4">
              {closed.length === 0 && <EmptyState label="No closed requests." />}
              {closed.map((r) => <RfiCard key={r.id} rfi={r} onChanged={refetch} />)}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{label}</CardContent></Card>
  );
}

function RfiCard({
  rfi,
  editable = false,
  onChanged,
}: {
  rfi: ComplaintRfi;
  editable?: boolean;
  onChanged: () => void;
}) {
  const [missing, setMissing] = useState<string[]>([]);
  const submit = useSubmitComplaintRfi();

  const overdue = rfi.due_at && rfi.status === 'open' && new Date(rfi.due_at).getTime() < Date.now();

  const doSubmit = async () => {
    setMissing([]);
    try {
      const res = await submit.mutateAsync(rfi.id);
      if (!res?.ok) {
        setMissing(res?.missing ?? ['Some mandatory questions are incomplete']);
        toast.error('Complete all mandatory questions before submitting');
        return;
      }
      toast.success('Responses submitted to the regulator for review');
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? 'Submission failed');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">
              {rfi.complaint_number ? `Complaint ${rfi.complaint_number}` : 'Complaint information request'}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {rfi.complaint_subject ? `${rfi.complaint_subject} · ` : ''}
              Issued {formatDateTime(rfi.raised_at)}
              {rfi.due_at ? ` · response due ${formatDateOnly(rfi.due_at)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {overdue && <Badge variant="destructive">Overdue</Badge>}
            <Badge variant={rfi.status === 'open' ? 'secondary' : 'outline'} className="capitalize">{rfi.status}</Badge>
          </div>
        </div>
        {rfi.summary && <p className="text-sm mt-2">{rfi.summary}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {missing.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Submission blocked</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-sm">
                {missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {rfi.items.map((item) => (
          <RfiItemRow key={item.id} rfi={rfi} item={item} editable={editable} onChanged={onChanged} />
        ))}

        {rfi.closure_notes && (
          <p className="text-xs text-muted-foreground">Regulator notes: {rfi.closure_notes}</p>
        )}

        {editable && (
          <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Draft answers are private to your organisation until you submit for review.
            </p>
            <Button data-rbac="complaint_management.submit" onClick={doSubmit} disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Submit for review
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RfiItemRow({
  rfi,
  item,
  editable,
  onChanged,
}: {
  rfi: ComplaintRfi;
  item: ComplaintRfiItem;
  editable: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const draft = item.responses.find((r) => r.is_draft);
  const submittedResponses = item.responses.filter((r) => !r.is_draft);
  const [text, setText] = useState(draft?.response_text ?? '');
  const [fileIds, setFileIds] = useState<string[]>(draft?.file_upload_ids ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useSaveComplaintRfiDraft();

  const locked = !editable || item.response_status === 'responded';

  const persist = async (nextText: string, nextFiles: string[], quiet = false) => {
    try {
      await save.mutateAsync({ item_id: item.id, response_text: nextText || null, file_upload_ids: nextFiles });
      if (!quiet) toast.success('Draft saved');
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save the draft');
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !user?.id) return;
    setUploading(true);
    const next = [...fileIds];
    for (const file of Array.from(files)) {
      const v = validateFile(file);
      if (!v.valid) {
        toast.error(`${file.name}: ${v.error}`);
        continue;
      }
      const up = await secureUpload(file, user.id, 'complaint_rfi', rfi.id);
      if (!up.success || !up.fileUploadId) {
        toast.error(`${file.name}: ${up.error ?? 'Upload failed'}`);
        continue;
      }
      next.push(up.fileUploadId);
    }
    setFileIds(next);
    if (fileRef.current) fileRef.current.value = '';
    await persist(text, next, true);
    setUploading(false);
    toast.success('Document attached');
  };

  const removeFile = async (id: string) => {
    const next = fileIds.filter((f) => f !== id);
    setFileIds(next);
    await persist(text, next, true);
  };

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium">
          <span className="font-mono text-xs text-muted-foreground mr-2">Q{item.ordinal}</span>
          {item.prompt}
        </p>
        <div className="flex items-center gap-2">
          {item.required && <Badge variant="secondary" className="text-[10px]">Mandatory</Badge>}
          {item.response_status === 'responded' && (
            <Badge variant="default" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Submitted</Badge>
          )}
          {item.response_status === 'returned' && (
            <Badge variant="destructive" className="text-[10px]">Clarification requested</Badge>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{TYPE_LABEL[item.question_type]}</p>

      {item.returned_reason && item.response_status === 'returned' && (
        <p className="text-xs text-destructive">Regulator: {item.returned_reason}</p>
      )}

      {submittedResponses.map((r) => (
        <div key={r.id} className="rounded-md bg-muted/50 p-2 space-y-2">
          {r.response_text && <p className="text-sm whitespace-pre-wrap">{r.response_text}</p>}
          <RfiAttachmentList fileIds={r.file_upload_ids ?? []} />
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" />Submitted {formatDateTime(r.submitted_at)} — read only
          </p>
        </div>
      ))}

      {!locked && (
        <div className="space-y-2">
          {(item.question_type === 'text' || item.question_type === 'both') && (
            <div className="space-y-1">
              <Label className="text-xs">Your response</Label>
              <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Provide your response" />
            </div>
          )}

          {(item.question_type === 'document' || item.question_type === 'both') && (
            <div className="space-y-1">
              <Label className="text-xs">Supporting documents</Label>
              <RfiAttachmentList fileIds={fileIds} onRemove={removeFile} />
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                accept={ACCEPT_STRING}
                onChange={(e) => addFiles(e.target.files)}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Paperclip className="h-4 w-4 mr-1" />}
                  Attach document
                </Button>
                <span className="text-xs text-muted-foreground">
                  Max {MAX_FILE_SIZE / (1024 * 1024)}MB each · stored in private secure storage
                </span>
              </div>
            </div>
          )}

          {item.question_type === 'text' && (
            <div className="space-y-1">
              <RfiAttachmentList fileIds={fileIds} onRemove={removeFile} />
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                accept={ACCEPT_STRING}
                onChange={(e) => addFiles(e.target.files)}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Paperclip className="h-4 w-4 mr-1" />Attach document (optional)
              </Button>
            </div>
          )}

          <Button data-rbac="complaint_management.edit" size="sm" variant="secondary" onClick={() => persist(text, fileIds)} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save draft
          </Button>
        </div>
      )}
    </div>
  );
}
