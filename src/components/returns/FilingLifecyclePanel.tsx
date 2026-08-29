/**
 * F7-B — canonical returns lifecycle workspace panel.
 *
 * One component serves both audiences from the same governed RPCs so the
 * regulator and the regulated entity can never diverge on the facts of a
 * filing. Audience only decides which governed action is offered:
 *
 *   REGULATOR — raise RFI, decide extension, decide amendment, review evidence.
 *   ENTITY     — request extension, request amendment, upload/withdraw evidence.
 *
 * No table is written from the browser: every mutation is a SECURITY DEFINER
 * RPC (`returns_*`) that enforces authority, maker-checker separation, reason
 * minimums, deadline recomputation and audit server-side. Decisions are taken
 * through the governed reason dialog, never a browser prompt.
 */
import { useRef, useState } from 'react';
import { Download, FileUp, Loader2, Paperclip } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ReasonDialog, type ReasonDialogRequest } from '@/components/governance/ReasonDialog';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { getSignedUrl, secureUpload } from '@/lib/secureFileUpload';
import { supabase } from '@/integrations/supabase/client';
import {
  useFilingEvidence, useFilingExtensions, useReturnsGovernanceMutations,
  type ReturnFilingExtension,
} from '@/hooks/useReturnsGovernance';

export interface LifecycleRequest {
  id: string;
  request_kind: string;
  message: string;
  status: string;
  response_text: string | null;
  created_at: string;
  responded_at: string | null;
}

const EXT_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Awaiting decision', GRANTED: 'Granted', REFUSED: 'Refused', WITHDRAWN: 'Withdrawn',
};

export function FilingLifecyclePanel({
  audience, filingId, versionId, periodId, originalDueDate, effectiveDueDate, requests = [], canAct = true,
}: {
  audience: 'REGULATOR' | 'ENTITY';
  filingId: string;
  versionId: string | null;
  periodId: string | null;
  originalDueDate?: string | null;
  effectiveDueDate?: string | null;
  requests?: LifecycleRequest[];
  canAct?: boolean;
}) {
  const regulator = audience === 'REGULATOR';
  const { data: extensions = [], isLoading: loadingExt } = useFilingExtensions(filingId, periodId);
  const { data: evidence = [], isLoading: loadingEvi } = useFilingEvidence(filingId);
  const {
    raiseRfi, requestAmendment, decideAmendment, requestExtension, decideExtension,
    attachEvidence, withdrawEvidence,
  } = useReturnsGovernanceMutations();

  const [decision, setDecision] = useState<ReasonDialogRequest | null>(null);
  const [rfiOpen, setRfiOpen] = useState(false);
  const [rfiMessage, setRfiMessage] = useState('');
  const [extOpen, setExtOpen] = useState(false);
  const [extDate, setExtDate] = useState('');
  const [extReason, setExtReason] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const amendmentRequests = requests.filter((r) => r.request_kind === 'AMENDMENT');
  const rfiRequests = requests.filter((r) => r.request_kind !== 'AMENDMENT' && r.request_kind !== 'EXTENSION');

  /* ---------------------------------------------------------------- RFI */
  const submitRfi = async () => {
    if (!versionId) { toast.error('This filing has no current version to query.'); return; }
    if (rfiMessage.trim().length < 10) { toast.error('Describe the information required (min 10 characters).'); return; }
    try {
      await raiseRfi.mutateAsync({ versionId, message: rfiMessage.trim() });
      toast.success('Information request issued to the entity.');
      setRfiOpen(false); setRfiMessage('');
    } catch (e: any) { toast.error(e?.message ?? 'The request could not be issued.'); }
  };

  /* ---------------------------------------------------------- Extensions */
  const submitExtension = async () => {
    if (!periodId) { toast.error('No reporting period is associated with this filing.'); return; }
    if (!extDate || extReason.trim().length < 10) {
      toast.error('Provide the requested date and a reason of at least 10 characters.'); return;
    }
    try {
      await requestExtension.mutateAsync({ periodId, requestedDueDate: extDate, reason: extReason.trim() });
      toast.success('Extension requested. The original deadline stands until a decision is recorded.');
      setExtOpen(false); setExtDate(''); setExtReason('');
    } catch (e: any) { toast.error(e?.message ?? 'The extension could not be requested.'); }
  };

  const decideExt = (x: ReturnFilingExtension, dec: 'GRANT' | 'REFUSE') => setDecision({
    title: dec === 'GRANT' ? 'Grant filing extension' : 'Refuse filing extension',
    description: dec === 'GRANT'
      ? 'Granting sets the effective deadline for this obligation. The original regulatory due date is retained unchanged for the record.'
      : 'Refusing leaves the original regulatory due date in force, including any late/overdue consequence.',
    context: [
      { label: 'Original due date', value: formatDateOnly(x.original_due_date) },
      { label: 'Requested due date', value: formatDateOnly(x.requested_due_date) },
      { label: 'Requested', value: formatDateTime(x.requested_at) },
      { label: 'Entity reason', value: x.reason },
    ],
    confirmLabel: dec === 'GRANT' ? 'Grant extension' : 'Refuse extension',
    destructive: dec === 'REFUSE',
    onConfirm: async (why) => {
      await decideExtension.mutateAsync({
        extensionId: x.id, decision: dec, reason: why,
        grantedDueDate: dec === 'GRANT' ? x.requested_due_date : null,
      });
      toast.success(dec === 'GRANT' ? 'Extension granted.' : 'Extension refused.');
    },
  });

  /* ---------------------------------------------------------- Amendments */
  const askAmendment = () => setDecision({
    title: 'Request permission to amend this filing',
    description: 'An accepted filing is immutable. If the request is approved a new version is generated for correction and resubmission; earlier versions remain unchanged.',
    context: [{ label: 'Filing', value: filingId.slice(0, 8) }],
    confirmLabel: 'Request amendment',
    onConfirm: async (why) => {
      await requestAmendment.mutateAsync({ filingId, reason: why });
      toast.success('Amendment requested. The regulator will decide.');
    },
  });

  const decideAmend = (r: LifecycleRequest, dec: 'APPROVE' | 'REFUSE') => setDecision({
    title: dec === 'APPROVE' ? 'Approve amendment request' : 'Refuse amendment request',
    description: dec === 'APPROVE'
      ? 'Approving creates a new working version for the entity. Previously accepted versions stay immutable and remain the record for their period.'
      : 'Refusing leaves the accepted version as the final record.',
    context: [
      { label: 'Requested', value: formatDateTime(r.created_at) },
      { label: 'Entity reason', value: r.message },
    ],
    confirmLabel: dec === 'APPROVE' ? 'Approve amendment' : 'Refuse amendment',
    destructive: dec === 'REFUSE',
    onConfirm: async (why) => {
      const res = await decideAmendment.mutateAsync({ requestId: r.id, decision: dec, reason: why });
      toast.success(dec === 'APPROVE'
        ? `Amendment approved${res?.new_version_id ? ' — a new version is available to the entity.' : '.'}`
        : 'Amendment refused.');
    },
  });

  /* ------------------------------------------------------------ Evidence */
  const upload = async (file: File) => {
    if (!versionId) { toast.error('No current version to attach evidence to.'); return; }
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('You must be signed in to upload evidence.');
      const res = await secureUpload(file, auth.user.id, 'return_filing_evidence', filingId);
      if (!res.success || !res.filePath) throw new Error(res.error ?? 'Upload failed.');
      await attachEvidence.mutateAsync({
        versionId, documentName: file.name, storagePath: res.filePath,
        fileType: file.type || null, fileSize: file.size,
      });
      toast.success('Evidence attached to the current version.');
    } catch (e: any) {
      toast.error(e?.message ?? 'The evidence could not be attached.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const download = async (path: string) => {
    const { url, error } = await getSignedUrl(path);
    if (!url) { toast.error(error ?? 'The document could not be opened.'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const withdrawEvi = (e: { id: string; document_name: string }) => setDecision({
    title: 'Withdraw evidence',
    description: 'Withdrawal is recorded against the document; the file and its provenance are retained for audit.',
    context: [{ label: 'Document', value: e.document_name }],
    confirmLabel: 'Withdraw evidence',
    destructive: true,
    onConfirm: async (why) => {
      await withdrawEvidence.mutateAsync({ evidenceId: e.id, reason: why });
      toast.success('Evidence withdrawn.');
    },
  });

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ RFI */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Information requests</CardTitle>
            <CardDescription>
              {regulator
                ? 'Queries raised on the current version. The entity responds in its filing workspace.'
                : 'Queries raised by the regulator on your filing. Respond in the Requests tab.'}
            </CardDescription>
          </div>
          {regulator && canAct && (
            <GuardedButton module="returns_management" action="workflow_action" size="sm"
              onClick={() => setRfiOpen(true)} disabled={!versionId}>Raise information request</GuardedButton>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {rfiRequests.length === 0
            ? <p className="py-4 text-center text-sm text-muted-foreground">No information requests raised.</p>
            : rfiRequests.map((r) => (
              <div key={r.id} className="rounded-md border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{r.request_kind}</Badge>
                  <Badge variant="outline">{r.status}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
                </div>
                <p className="text-sm">{r.message}</p>
                {r.response_text && (
                  <div className="mt-2 rounded-md bg-muted/50 p-2 text-sm">
                    <p className="text-xs text-muted-foreground">Entity response — {formatDateTime(r.responded_at)}</p>
                    <p>{r.response_text}</p>
                  </div>
                )}
              </div>
            ))}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------- Extensions */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Deadline extensions</CardTitle>
            <CardDescription>
              The original regulatory due date is never overwritten. A granted extension sets the effective
              deadline used for late and overdue assessment.
            </CardDescription>
          </div>
          {!regulator && canAct && (
            <GuardedButton module="returns_management" action="submit" size="sm"
              onClick={() => setExtOpen(true)} disabled={!periodId}>Request extension</GuardedButton>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Fact label="Original due date" value={originalDueDate ? formatDateOnly(originalDueDate) : '—'} />
            <Fact label="Effective deadline" value={effectiveDueDate ? formatDateOnly(effectiveDueDate) : (originalDueDate ? formatDateOnly(originalDueDate) : '—')} />
          </div>
          {loadingExt ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : extensions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No extension has been requested.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Original</TableHead><TableHead>Requested</TableHead><TableHead>Granted</TableHead>
                <TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead>Decision</TableHead>
                {regulator && <TableHead className="text-right">Action</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {extensions.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell>{formatDateOnly(x.original_due_date)}</TableCell>
                    <TableCell>{formatDateOnly(x.requested_due_date)}</TableCell>
                    <TableCell>{x.granted_due_date ? formatDateOnly(x.granted_due_date) : '—'}</TableCell>
                    <TableCell><Badge variant="outline">{EXT_STATUS_LABELS[x.status] ?? x.status}</Badge></TableCell>
                    <TableCell className="max-w-[16rem] truncate" title={x.reason}>{x.reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {x.decided_at ? `${formatDateTime(x.decided_at)} — ${x.decision_reason ?? 'no reason recorded'}` : 'Pending'}
                    </TableCell>
                    {regulator && (
                      <TableCell className="space-x-2 whitespace-nowrap text-right">
                        {x.status === 'REQUESTED' && canAct && (
                          <>
                            <GuardedButton module="returns_management" action="workflow_action" size="sm"
                              onClick={() => decideExt(x, 'GRANT')}>Grant</GuardedButton>
                            <GuardedButton module="returns_management" action="workflow_action" size="sm" variant="outline"
                              onClick={() => decideExt(x, 'REFUSE')}>Refuse</GuardedButton>
                          </>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------- Amendments */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Amendments</CardTitle>
            <CardDescription>
              An accepted filing is immutable. Approved amendments generate a new version for resubmission and
              leave the earlier accepted version intact.
            </CardDescription>
          </div>
          {!regulator && canAct && (
            <GuardedButton module="returns_management" action="submit" size="sm" variant="outline"
              onClick={askAmendment}>Request amendment</GuardedButton>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {amendmentRequests.length === 0
            ? <p className="py-4 text-center text-sm text-muted-foreground">No amendment has been requested.</p>
            : amendmentRequests.map((r) => (
              <div key={r.id} className="rounded-md border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{r.status}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
                </div>
                <p className="text-sm">{r.message}</p>
                {r.response_text && (
                  <p className="mt-2 rounded-md bg-muted/50 p-2 text-sm">
                    Decision — {r.response_text}
                  </p>
                )}
                {regulator && canAct && r.status !== 'CLOSED' && r.status !== 'RESPONDED' && (
                  <div className="mt-2 space-x-2">
                    <GuardedButton module="returns_management" action="workflow_action" size="sm"
                      onClick={() => decideAmend(r, 'APPROVE')}>Approve amendment</GuardedButton>
                    <GuardedButton module="returns_management" action="workflow_action" size="sm" variant="outline"
                      onClick={() => decideAmend(r, 'REFUSE')}>Refuse amendment</GuardedButton>
                  </div>
                )}
              </div>
            ))}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- Evidence */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Paperclip className="h-4 w-4" />Supporting evidence</CardTitle>
            <CardDescription>
              Evidence is bound to the exact filing version it was provided for, so historical versions keep
              their own supporting record.
            </CardDescription>
          </div>
          {!regulator && canAct && (
            <div>
              <Input ref={fileRef} type="file" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
              <GuardedButton module="returns_management" action="submit" size="sm" variant="outline"
                disabled={uploading || !versionId} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileUp className="mr-1 h-4 w-4" />}
                Upload evidence
              </GuardedButton>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loadingEvi ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : evidence.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No evidence attached.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Document</TableHead><TableHead>Version</TableHead><TableHead>Uploaded</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {evidence.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.document_name}</TableCell>
                    <TableCell className="font-mono text-xs">{e.return_filing_version_id.slice(0, 8)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(e.uploaded_at)}</TableCell>
                    <TableCell>
                      {e.withdrawn_at
                        ? <Badge variant="outline" title={e.withdrawn_reason ?? ''}>Withdrawn</Badge>
                        : <Badge variant="outline">Current</Badge>}
                    </TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => download(e.storage_path)}>
                        <Download className="mr-1 h-4 w-4" />Open
                      </Button>
                      {!regulator && canAct && !e.withdrawn_at && (
                        <GuardedButton module="returns_management" action="submit" size="sm" variant="outline"
                          onClick={() => withdrawEvi(e)}>Withdraw</GuardedButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Governed RFI dialog */}
      <Dialog open={rfiOpen} onOpenChange={setRfiOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise an information request</DialogTitle>
            <DialogDescription>
              The entity is notified and the filing records that it is awaiting the entity until a response is provided.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rfi-message">Information required</Label>
            <Textarea id="rfi-message" rows={4} value={rfiMessage} onChange={(e) => setRfiMessage(e.target.value)}
              placeholder="State precisely what the entity must provide or explain (minimum 10 characters)" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRfiOpen(false)}>Cancel</Button>
            <GuardedButton module="returns_management" action="workflow_action"
              onClick={submitRfi} disabled={raiseRfi.isPending}>Issue request</GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Governed extension request dialog */}
      <Dialog open={extOpen} onOpenChange={setExtOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a filing extension</DialogTitle>
            <DialogDescription>
              The original regulatory due date remains in force until the regulator records a decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Fact label="Original due date" value={originalDueDate ? formatDateOnly(originalDueDate) : '—'} />
            <div className="space-y-1.5">
              <Label htmlFor="ext-date">Requested due date</Label>
              <Input id="ext-date" type="date" value={extDate} onChange={(e) => setExtDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ext-reason">Reason</Label>
              <Textarea id="ext-reason" rows={3} value={extReason} onChange={(e) => setExtReason(e.target.value)}
                placeholder="Explain why the return cannot be filed by the regulatory due date (minimum 10 characters)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtOpen(false)}>Cancel</Button>
            <GuardedButton module="returns_management" action="submit"
              onClick={submitExtension} disabled={requestExtension.isPending}>Submit request</GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonDialog request={decision} onClose={() => setDecision(null)} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
