import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Loader2, MessageSquare, Paperclip, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { useApplicationRfis, type Rfi, type RfiItem } from '@/hooks/useApplicationRfis';
import { RaiseRfiDialog } from './RaiseRfiDialog';
import { validateFile, ACCEPT_STRING } from '@/lib/secureFileUpload';

interface ApplicationRfiTabProps {
  applicationId: string;
  currentUserId: string;
  isInternal: boolean;
  isApplicant: boolean;
  approvalStepActionId?: string | null;
  workflowTypeKey?: string | null;
  sectorId?: string | null;
  formData?: unknown;
}

const statusBadge: Record<string, string> = {
  open: 'bg-orange-100 text-orange-800 border-orange-200',
  responded: 'bg-blue-100 text-blue-800 border-blue-200',
  closed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-gray-100 text-gray-700 border-gray-200',
};

export function ApplicationRfiTab({
  applicationId,
  currentUserId,
  isInternal,
  isApplicant,
  approvalStepActionId,
}: ApplicationRfiTabProps) {
  const { rfis, loading, reload } = useApplicationRfis(applicationId);
  const [closeNotesById, setCloseNotesById] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState<string | null>(null);

  const closeRfi = async (rfi: Rfi) => {
    setClosing(rfi.id);
    try {
      const { error } = await supabase
        .from('application_rfis' as any)
        .update({
          status: 'closed',
          closed_by: currentUserId,
          closed_at: new Date().toISOString(),
          closure_notes: closeNotesById[rfi.id] || null,
        })
        .eq('id', rfi.id);
      if (error) throw error;

      // Resume SLA on the linked approval step action if it was paused
      if (rfi.approval_step_action_id) {
        await supabase
          .from('approval_step_actions' as any)
          .update({ resumed_at: new Date().toISOString() })
          .eq('id', rfi.approval_step_action_id);
      }

      await supabase.from('audit_logs' as any).insert({
        user_id: currentUserId,
        action: 'application.rfi_closed',
        table_name: 'applications',
        record_id: applicationId,
        new_values: { rfi_id: rfi.id, closure_notes: closeNotesById[rfi.id] || null },
      });

      toast.success('RFI closed');
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Failed to close RFI');
    } finally {
      setClosing(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Requests for Information</h3>
          <p className="text-sm text-muted-foreground">
            Structured information requests raised by reviewers.
          </p>
        </div>
        {isInternal && (
          <RaiseRfiDialog
            applicationId={applicationId}
            raisedBy={currentUserId}
            approvalStepActionId={approvalStepActionId}
            onCreated={reload}
          />
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rfis.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No information requests raised on this application.
          </CardContent>
        </Card>
      ) : (
        rfis.map((rfi) => (
          <RfiCard
            key={rfi.id}
            rfi={rfi}
            isInternal={isInternal}
            isApplicant={isApplicant}
            currentUserId={currentUserId}
            onChanged={reload}
            closeNote={closeNotesById[rfi.id] || ''}
            setCloseNote={(v) => setCloseNotesById((prev) => ({ ...prev, [rfi.id]: v }))}
            onClose={() => closeRfi(rfi)}
            closingBusy={closing === rfi.id}
          />
        ))
      )}
    </div>
  );
}

interface RfiCardProps {
  rfi: Rfi;
  isInternal: boolean;
  isApplicant: boolean;
  currentUserId: string;
  onChanged: () => void;
  closeNote: string;
  setCloseNote: (v: string) => void;
  onClose: () => void;
  closingBusy: boolean;
}

function RfiCard({
  rfi,
  isInternal,
  isApplicant,
  currentUserId,
  onChanged,
  closeNote,
  setCloseNote,
  onClose,
  closingBusy,
}: RfiCardProps) {
  const [open, setOpen] = useState(true);
  const totalItems = rfi.items?.length ?? 0;
  const respondedItems = rfi.items?.filter((i) => i.response_status === 'responded').length ?? 0;
  const isOpen = rfi.status === 'open' || rfi.status === 'responded';

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1 text-left">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium">
                      RFI · {formatDistanceToNow(new Date(rfi.raised_at), { addSuffix: true })}
                    </span>
                  </button>
                </CollapsibleTrigger>
                <Badge className={statusBadge[rfi.status] || ''}>{rfi.status}</Badge>
                {rfi.due_at && (
                  <span className="text-xs text-muted-foreground">
                    Due {new Date(rfi.due_at).toLocaleDateString()}
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {respondedItems}/{totalItems} responded
                </span>
              </div>
              {rfi.summary && <p className="text-sm mt-2">{rfi.summary}</p>}
            </div>
          </div>

          <CollapsibleContent className="mt-4 space-y-3">
            {rfi.items?.map((item, idx) => (
              <RfiItemRow
                key={item.id}
                item={item}
                idx={idx}
                isApplicant={isApplicant}
                isInternal={isInternal}
                rfiStatus={rfi.status}
                currentUserId={currentUserId}
                applicationId={rfi.application_id}
                rfiId={rfi.id}
                onChanged={onChanged}
              />
            ))}

            {isInternal && isOpen && (
              <div className="border-t pt-3 space-y-2">
                <Label className="text-xs">Closure notes (optional)</Label>
                <Textarea
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  placeholder="Note the outcome of this RFI"
                  rows={2}
                />
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={onClose} disabled={closingBusy}>
                    {closingBusy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Close RFI & resume SLA
                  </Button>
                </div>
              </div>
            )}

            {rfi.status === 'closed' && rfi.closure_notes && (
              <div className="border-t pt-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">Closure notes</div>
                {rfi.closure_notes}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

interface RfiItemRowProps {
  item: RfiItem;
  idx: number;
  isApplicant: boolean;
  isInternal: boolean;
  rfiStatus: string;
  currentUserId: string;
  applicationId: string;
  rfiId: string;
  onChanged: () => void;
}

function RfiItemRow({
  item,
  idx,
  isApplicant,
  isInternal,
  rfiStatus,
  currentUserId,
  applicationId,
  rfiId,
  onChanged,
}: RfiItemRowProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const canRespond =
    isApplicant &&
    (rfiStatus === 'open' || rfiStatus === 'responded') &&
    item.response_status !== 'responded';

  const submit = async () => {
    const needsText = item.question_type === 'text' || item.question_type === 'both';
    const needsDoc = item.question_type === 'document' || item.question_type === 'both';
    if (needsText && !text.trim()) {
      toast.error('Please enter a response');
      return;
    }
    if (needsDoc && !file) {
      toast.error('Please attach a document');
      return;
    }
    if (file) {
      const v = validateFile(file);
      if (!v.valid) {
        toast.error(v.error!);
        return;
      }
    }
    setSaving(true);
    try {
      const fileUploadIds: string[] = [];
      if (file) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${currentUserId}/rfi/${rfiId}/${Date.now()}-${sanitized}`;
        const { error: upErr } = await supabase.storage
          .from('secure-documents')
          .upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;
        const { data: rec, error: dbErr } = await supabase
          .from('file_uploads' as any)
          .insert({
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            mime_type: file.type,
            file_extension: ext,
            uploaded_by: currentUserId,
            entity_type: 'rfi_response',
            entity_id: item.id,
            bucket_name: 'secure-documents',
            scan_status: 'clean',
            metadata: { rfi_id: rfiId, rfi_item_id: item.id },
          })
          .select('id')
          .single();
        if (dbErr) throw dbErr;
        fileUploadIds.push((rec as any).id);
      }

      const { error: respErr } = await supabase.from('application_rfi_responses' as any).insert({
        rfi_item_id: item.id,
        response_text: text.trim() || null,
        file_upload_ids: fileUploadIds,
        submitted_by: currentUserId,
      });
      if (respErr) throw respErr;

      await supabase
        .from('application_rfi_items' as any)
        .update({ response_status: 'responded' })
        .eq('id', item.id);

      // If all items responded, flip RFI status to 'responded' and resume SLA
      const { data: siblings } = await supabase
        .from('application_rfi_items' as any)
        .select('response_status')
        .eq('rfi_id', rfiId);
      const allDone = (siblings as any[] | null)?.every((s) => s.response_status === 'responded');
      if (allDone) {
        const { data: rfiRow } = await supabase
          .from('application_rfis' as any)
          .select('approval_step_action_id')
          .eq('id', rfiId)
          .maybeSingle();
        await supabase
          .from('application_rfis' as any)
          .update({ status: 'responded' })
          .eq('id', rfiId);
        const stepId = (rfiRow as any)?.approval_step_action_id;
        if (stepId) {
          await supabase
            .from('approval_step_actions' as any)
            .update({ resumed_at: new Date().toISOString() })
            .eq('id', stepId);
        }
      }

      await supabase.from('audit_logs' as any).insert({
        user_id: currentUserId,
        action: 'application.rfi_responded',
        table_name: 'applications',
        record_id: applicationId,
        new_values: { rfi_id: rfiId, rfi_item_id: item.id, all_items_done: !!allDone },
      });

      toast.success('Response submitted');
      setText('');
      setFile(null);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit response');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-md p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
            <span>
              {idx + 1}. {item.prompt}
            </span>
            {item.required && (
              <Badge variant="outline" className="text-xs">
                Required
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {item.question_type}
            </Badge>
            {item.item_due_at && (
              <span className="text-xs text-muted-foreground">
                Due {new Date(item.item_due_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <Badge
          className={
            item.response_status === 'responded'
              ? 'bg-green-100 text-green-800 border-green-200'
              : 'bg-orange-100 text-orange-800 border-orange-200'
          }
        >
          {item.response_status}
        </Badge>
      </div>

      {(item.responses?.length ?? 0) > 0 && (
        <div className="mt-3 space-y-2">
          {item.responses!.map((r) => (
            <div key={r.id} className="bg-muted/50 rounded p-2 text-sm">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                <MessageSquare className="h-3 w-3" />
                {formatDistanceToNow(new Date(r.submitted_at), { addSuffix: true })}
              </div>
              {r.response_text && <div className="whitespace-pre-wrap">{r.response_text}</div>}
              {r.file_upload_ids.length > 0 && (
                <div className="mt-2 text-xs flex items-center gap-1 text-muted-foreground">
                  <Paperclip className="h-3 w-3" />
                  {r.file_upload_ids.length} attachment{r.file_upload_ids.length === 1 ? '' : 's'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canRespond && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {(item.question_type === 'text' || item.question_type === 'both') && (
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Your response"
              rows={2}
              disabled={saving}
            />
          )}
          {(item.question_type === 'document' || item.question_type === 'both') && (
            <Input
              type="file"
              accept={ACCEPT_STRING}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={saving}
            />
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Submit response
            </Button>
          </div>
        </div>
      )}

      {!canRespond && isApplicant && item.response_status !== 'responded' && (
        <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="h-3 w-3" /> This RFI is closed to further responses.
        </div>
      )}
    </div>
  );
}
