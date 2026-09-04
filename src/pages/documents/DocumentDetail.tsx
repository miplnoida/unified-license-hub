/**
 * Document Detail — the governed record view for one canonical document.
 *
 * All content comes from `dms_get_document`; all actions go through the
 * governed DMS service. Legal hold and unsafe/unscanned files are shown
 * prominently and the actions the server would refuse are disabled here too.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
  AlertTriangle, ArrowLeft, Archive, CheckCircle2, Gavel, Link2, Lock,
  Pencil, RotateCcw, ShieldCheck, Tags, Trash2,
} from 'lucide-react';
import { useDmsDocument } from '@/hooks/useDmsDocuments';
import { useCan } from '@/hooks/useCan';
import { DmsBadge } from '@/components/documents/dms/DmsBadges';
import {
  ClassifyDocumentDialog, DocumentDecisionDialog, DocumentDetailsDialog, LinkRecordDialog,
} from '@/components/documents/dms/DmsActionDialogs';
import {
  formatDocumentSize, isDisposalBlocked, isFileQuarantined, isFileReleased, presentAcceptance, presentConfidentiality,
  presentContextType, presentDocumentStatus, presentLegalHold, presentPublication, presentScan,
  presentVerification,
} from '@/lib/presentation/dmsLabels';
import { humanize } from '@/lib/presentation/statusLabels';
import { formatDateTime } from '@/lib/datetime';
import { archiveDocument, describeDmsError, restoreDocument, softDeleteDocument } from '@/services/dms';

type Row = Record<string, unknown>;
const s = (row: Row | null | undefined, key: string): string | null => {
  const v = row?.[key];
  return v == null || v === '' ? null : String(v);
};
const dateText = (row: Row | null | undefined, key: string) => {
  const v = s(row, key);
  return v ? formatDateTime(v) : '—';
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default function DocumentDetail() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useDmsDocument(documentId);

  const [editOpen, setEditOpen] = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = useCan('document_management', 'edit_metadata');
  const canClassify = useCan('document_management', 'classify');
  const canVerify = useCan('document_management', 'verify');
  const canAccept = useCan('document_management', 'accept');
  const canArchive = useCan('document_management', 'archive');
  const canRestore = useCan('document_management', 'restore');
  const canDelete = useCan('document_management', 'delete');
  const canLink = useCan('document_management', 'link_record');

  const doc = (data?.document ?? null) as Row | null;
  const versions = (data?.versions ?? []) as Row[];
  const relationships = (data?.relationships ?? []) as Row[];
  const holds = (data?.holds ?? []) as Row[];
  const audit = (data?.audit ?? []) as Row[];
  const category = (data?.category ?? null) as Row | null;
  const type = (data?.type ?? null) as Row | null;
  const retention = (data?.retention_policy ?? null) as Row | null;

  const currentVersion = useMemo(() => {
    const currentId = s(doc, 'current_version_id');
    return versions.find((v) => s(v, 'id') === currentId) ?? versions[0] ?? null;
  }, [doc, versions]);

  const legalHold = s(doc, 'legal_hold_status') ?? 'none';
  // Malware safety comes ONLY from the authoritative current-file scan record
  // returned by dms_get_document — never from a version lifecycle status.
  const currentFile = (data?.current_file ?? null) as unknown as Row | null;
  const scanStatus = s(currentFile, 'scan_status') ?? 'unknown';
  const fileReleased = currentFile
    ? currentFile.released === true
    : isFileReleased(currentFile as never);
  const fileQuarantined = isFileQuarantined(currentFile as never);
  const holdBlocks = isDisposalBlocked(legalHold);
  const isArchived = (s(doc, 'document_status') ?? 'available') === 'archived' || !!s(doc, 'archived_at');
  const isDeleted = doc?.is_deleted === true;
  const notReleasedTitle = fileQuarantined
    ? 'This file has been quarantined by the security scan and cannot be used.'
    : 'The file must pass its security scan before this action is available.';


  const run = async (label: string, fn: () => Promise<{ success: true; data: string } | { success: false; error: string }>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if ('error' in res) { toast.error(describeDmsError(res.error)); return; }
    toast.success(label);
    refetch();
  };

  const askReason = async (title: string, confirmText: string) => {
    const result = await Swal.fire({
      title,
      input: 'textarea',
      inputLabel: 'Reason (recorded in the audit trail)',
      showCancelButton: true,
      confirmButtonText: confirmText,
    });
    if (!result.isConfirmed) return null;
    return (result.value as string) || undefined;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !doc) {
    return (
      <DashboardLayout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Document unavailable</AlertTitle>
          <AlertDescription>
            This document could not be opened. It may have been removed, or you may not have access to it.
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/documents/registry')}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back to Document Register
        </Button>
      </DashboardLayout>
    );
  }

  const title = s(doc, 'display_name') || s(currentVersion, 'original_file_name') || 'Document';

  return (
    <DashboardLayout>
      <PageHeader
        title={title}
        description={`${s(doc, 'document_reference') ?? 'Not referenced'} · ${category ? s(category, 'name') : 'Unclassified'}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/documents/registry')}>
              <ArrowLeft className="mr-2 h-4 w-4" />Register
            </Button>
            {canEdit && !isDeleted && (
              <Button data-rbac="document_management.edit_metadata" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />Edit details
              </Button>
            )}
            {canClassify && !isDeleted && (
              <Button data-rbac="document_management.classify" variant="outline" size="sm" onClick={() => setClassifyOpen(true)}>
                <Tags className="mr-2 h-4 w-4" />Classify
              </Button>
            )}
            {canVerify && (
              <Button
                data-rbac="document_management.verify"
                variant="outline" size="sm" disabled={!fileReleased || busy}
                title={fileReleased ? undefined : notReleasedTitle}
                onClick={() => setVerifyOpen(true)}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />Verify
              </Button>
            )}
            {canAccept && (
              <Button
                data-rbac="document_management.accept"
                variant="outline" size="sm" disabled={!fileReleased || busy}
                title={fileReleased ? undefined : notReleasedTitle}
                onClick={() => setAcceptOpen(true)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />Acceptance
              </Button>
            )}

            {canLink && !isDeleted && (
              <Button data-rbac="document_management.link_record" variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" />Link record
              </Button>
            )}
            {isArchived
              ? canRestore && (
                <Button
                  data-rbac="document_management.restore"
                  variant="outline" size="sm" disabled={busy}
                  onClick={async () => {
                    const reason = await askReason('Restore this document?', 'Restore');
                    if (reason === null) return;
                    run('Document restored', () => restoreDocument(documentId!, reason));
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />Restore
                </Button>
              )
              : canArchive && (
                <Button
                  data-rbac="document_management.archive"
                  variant="outline" size="sm" disabled={busy || holdBlocks}
                  title={holdBlocks ? 'This document is under legal hold and cannot be archived for disposal.' : undefined}
                  onClick={async () => {
                    const reason = await askReason('Archive this document?', 'Archive');
                    if (reason === null) return;
                    run('Document archived', () => archiveDocument(documentId!, reason));
                  }}
                >
                  <Archive className="mr-2 h-4 w-4" />Archive
                </Button>
              )}

            {canDelete && !isDeleted && (
              <Button
                data-rbac="document_management.delete"
                variant="destructive" size="sm" disabled={busy || holdBlocks}
                title={holdBlocks ? 'This document is under legal hold and cannot be deleted.' : undefined}
                onClick={async () => {
                  const reason = await askReason('Delete this document?', 'Delete');
                  if (reason === null) return;
                  run('Document deleted', () => softDeleteDocument(documentId!, reason));
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />Delete
              </Button>
            )}
          </div>
        }
      />

      {holdBlocks && (
        <Alert className="mb-4 border-destructive/40 bg-destructive/5">
          <Gavel className="h-4 w-4" />
          <AlertTitle>Under legal hold</AlertTitle>
          <AlertDescription>
            This document is preserved under legal hold. Archiving for disposal and deletion are blocked until the hold
            is released.
          </AlertDescription>
        </Alert>
      )}
      {!fileReleased && (
        <Alert className={`mb-4 ${fileQuarantined ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
          <Lock className="h-4 w-4" />
          <AlertTitle>{presentScan(scanStatus).label}</AlertTitle>
          <AlertDescription>
            {fileQuarantined
              ? 'The current file has been quarantined by the security scan. It cannot be verified, accepted or downloaded, and the restriction is enforced by the server.'
              : 'The current file has not yet been released by its security scan. Verification, acceptance and download stay unavailable until a trusted scan verdict clears it.'}
          </AlertDescription>
        </Alert>
      )}

      {isDeleted && (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Deleted document — read only</AlertTitle>
          <AlertDescription>
            This document has been removed from ordinary use. It remains visible here for audit and history.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Overview</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Reference"><span className="font-mono text-xs">{s(doc, 'document_reference') ?? 'Not referenced'}</span></Field>
            <Field label="Document name">{s(doc, 'display_name') ?? '—'}</Field>
            <Field label="Record status"><DmsBadge presented={presentDocumentStatus(isDeleted ? 'deleted' : s(doc, 'document_status') ?? 'available')} /></Field>
            <Field label="Current file">
              {s(currentVersion, 'original_file_name') ?? '—'}
              <div className="text-[11px] text-muted-foreground">
                {formatDocumentSize(currentVersion?.file_size as number | null)}
                {currentVersion ? ` · version ${s(currentVersion, 'version')}` : ''}
              </div>
            </Field>
            <Field label="Document date">{dateText(doc, 'document_date')}</Field>
            <Field label="Expires on">{dateText(doc, 'expiry_date')}</Field>
            <Field label="Effective from">{dateText(doc, 'effective_from')}</Field>
            <Field label="Effective until">{dateText(doc, 'effective_until')}</Field>
            <Field label="Reporting period">
              {s(doc, 'reporting_period_start') || s(doc, 'reporting_period_end')
                ? `${dateText(doc, 'reporting_period_start')} – ${dateText(doc, 'reporting_period_end')}`
                : '—'}
            </Field>
            <Field label="Created">{dateText(doc, 'created_at')}</Field>
            <Field label="Last updated">{dateText(doc, 'updated_at')}</Field>
            <Field label="Tags">
              {Array.isArray(doc.tags) && (doc.tags as string[]).length
                ? <div className="flex flex-wrap gap-1">{(doc.tags as string[]).map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
                : '—'}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Assurance</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Verification"><DmsBadge presented={presentVerification(s(doc, 'verification_status'))} /></Field>
            <Field label="Acceptance"><DmsBadge presented={presentAcceptance(s(doc, 'acceptance_status'))} /></Field>
            <Field label="File safety">
              <div className="space-y-1">
                <DmsBadge presented={presentScan(scanStatus)} />
                <p className="text-[11px] text-muted-foreground">
                  {fileReleased ? 'Released for use' : 'Not released for use'}
                  {s(currentFile, 'scan_provider') ? ` · checked by ${s(currentFile, 'scan_provider')}` : ''}
                  {s(currentFile, 'scanned_at') ? ` · ${dateText(currentFile, 'scanned_at')}` : ''}
                </p>
              </div>
            </Field>
            <Field label="Legal hold"><DmsBadge presented={presentLegalHold(legalHold)} /></Field>

          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Classification &amp; retention</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Category">{category ? s(category, 'name') : 'Unclassified'}</Field>
            <Field label="Document type">{type ? s(type, 'name') : '—'}</Field>
            <Field label="Sensitivity"><DmsBadge presented={presentConfidentiality(s(doc, 'confidentiality_classification'))} /></Field>
            <Field label="Publication"><DmsBadge presented={presentPublication(s(doc, 'publication_eligibility'))} /></Field>
            <Field label="Retention policy">{retention ? s(retention, 'name') : 'Not set'}</Field>
            <Field label="Retain until">{dateText(doc, 'retention_until')}</Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Canonical context</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Owning entity">
              {s(doc, 'primary_entity_id')
                ? <a className="text-primary hover:underline" href={`/entities/${s(doc, 'primary_entity_id')}`}>Open entity record</a>
                : 'Not resolved to an entity yet'}
            </Field>
            <Field label="Source record">{presentContextType(s(doc, 'source_record_type'))}</Field>
            <Field label="Source reference">{s(doc, 'source_reference') ?? '—'}</Field>
            <Field label="Originating area">{s(doc, 'source_module') ? humanize(s(doc, 'source_module')!) : '—'}</Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Linked records ({relationships.length})</CardTitle></CardHeader>
          <CardContent>
            {relationships.length === 0 ? (
              <p className="text-sm text-muted-foreground">This document is not linked to any other record.</p>
            ) : (
              <ul className="divide-y text-sm">
                {relationships.map((r) => (
                  <li key={s(r, 'id') ?? Math.random()} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <Badge variant="outline" className="mr-2">{presentContextType(s(r, 'target_type'))}</Badge>
                      {s(r, 'target_reference') ?? 'Linked record'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{humanize(s(r, 'relationship_type') ?? '')}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              Links are governed centrally. Removing a link is an out-of-scope residual in this release: no governed
              unlink operation exists yet, and relationships are never deleted from the browser.
            </p>

          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Versions ({versions.length})</CardTitle></CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No file versions recorded.</p>
            ) : (
              <ul className="divide-y text-sm">
                {versions.map((v) => (
                  <li key={s(v, 'id') ?? Math.random()} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{s(v, 'original_file_name') ?? `Version ${s(v, 'version')}`}</span>
                        <Badge variant={s(v, 'id') === s(doc, 'current_version_id') ? 'default' : 'secondary'}>
                          Version {s(v, 'version')}{s(v, 'id') === s(doc, 'current_version_id') ? ' · current' : ''}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDocumentSize(v.file_size as number | null)} · {dateText(v, 'created_at')}
                        {s(v, 'change_note') ? ` · ${s(v, 'change_note')}` : ''}
                      </p>
                    </div>
                    {s(v, 'id') === s(doc, 'current_version_id') ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <DmsBadge presented={presentScan(scanStatus)} />
                        {!fileReleased && (
                          <span className="text-[11px] text-muted-foreground" title={notReleasedTitle}>
                            Download unavailable
                          </span>
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        {humanize(s(v, 'version_status') ?? 'superseded')}
                      </Badge>
                    )}


                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Legal holds ({holds.length})</CardTitle></CardHeader>
          <CardContent>
            {holds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No holds have been placed on this document.</p>
            ) : (
              <ul className="divide-y text-sm">
                {holds.map((h) => (
                  <li key={s(h, 'id') ?? Math.random()} className="py-2">
                    <div className="flex items-center gap-2">
                      <DmsBadge presented={presentLegalHold(s(h, 'status') === 'active' ? 'on_hold' : 'released')} />
                      <span className="text-[11px] text-muted-foreground">{dateText(h, 'placed_at')}</span>
                    </div>
                    <p className="mt-1 text-xs">{s(h, 'reason') ?? '—'}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Activity &amp; audit trail ({audit.length})</CardTitle></CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {audit.map((a) => (
                  <li key={s(a, 'id') ?? Math.random()} className="flex items-center justify-between gap-3 py-2">
                    <span><Badge variant="outline" className="mr-2">{humanize(s(a, 'action') ?? '')}</Badge></span>
                    <span className="text-[11px] text-muted-foreground">{dateText(a, 'created_at')}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {documentId && (
        <>
          <DocumentDetailsDialog
            open={editOpen} onOpenChange={setEditOpen} groupId={documentId} onDone={refetch}
            initial={{
              displayName: s(doc, 'display_name'),
              documentDate: s(doc, 'document_date'),
              effectiveFrom: s(doc, 'effective_from'),
              effectiveUntil: s(doc, 'effective_until'),
              expiryDate: s(doc, 'expiry_date'),
              reportingPeriodStart: s(doc, 'reporting_period_start'),
              reportingPeriodEnd: s(doc, 'reporting_period_end'),
              tags: Array.isArray(doc.tags) ? (doc.tags as string[]) : [],
            }}
          />
          <ClassifyDocumentDialog
            open={classifyOpen} onOpenChange={setClassifyOpen} groupId={documentId} onDone={refetch}
            initial={{
              categoryCode: category ? s(category, 'code') : null,
              typeCode: type ? s(type, 'code') : null,
              confidentiality: s(doc, 'confidentiality_classification'),
              publicationEligibility: s(doc, 'publication_eligibility'),
              retentionPolicyCode: retention ? s(retention, 'code') : null,
            }}
          />
          <DocumentDecisionDialog open={verifyOpen} onOpenChange={setVerifyOpen} groupId={documentId} onDone={refetch} kind="verification" />
          <DocumentDecisionDialog open={acceptOpen} onOpenChange={setAcceptOpen} groupId={documentId} onDone={refetch} kind="acceptance" />
          <LinkRecordDialog
            open={linkOpen} onOpenChange={setLinkOpen} groupId={documentId} onDone={refetch}
            entityId={s(doc, 'primary_entity_id') || null}
            linkedRecordIds={relationships.map((r) => String(r.target_id ?? '')).filter(Boolean)}
          />

        </>
      )}
    </DashboardLayout>
  );
}
