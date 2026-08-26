/**
 * MC-03 — Evidence register and chain of custody.
 *
 * Evidence carries a reference, source, custody state, integrity hash, version
 * chain and a confidentiality classification. Restricted/privileged items are
 * filtered server-side by `get_complaint_investigation_workspace`; nothing here
 * decides visibility. Every write goes through the governed evidence RPCs.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, FileSearch, Link2, Loader2, Lock, Plus, Unlink } from 'lucide-react';
import { SectionState } from '@/components/complaints/DataState';
import { formatDateTime } from '@/lib/datetime';
import {
  investigationOps,
  useInvestigationMutation,
  type EvidenceItem,
  type InvestigationWorkspace,
} from '@/hooks/useComplaintInvestigation';

interface Props { complaintId: string; workspace: InvestigationWorkspace }

const SOURCE_TYPES = ['COMPLAINANT', 'ENTITY', 'REGULATOR', 'THIRD_PARTY', 'PUBLIC_RECORD'];
const CONFIDENTIALITY = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'ENTITY_SHAREABLE', label: 'Shareable with the entity' },
  { value: 'INTERNAL', label: 'Internal only' },
  { value: 'RESTRICTED', label: 'Restricted' },
];
const RELIABILITY = [
  { value: 'NOT_ASSESSED', label: 'Not assessed' },
  { value: 'LOW', label: 'Low' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'HIGH', label: 'High' },
];
const RELEVANCE = [
  { value: 'NOT_ASSESSED', label: 'Not assessed' },
  { value: 'CONTEXTUAL', label: 'Contextual' },
  { value: 'RELEVANT', label: 'Relevant' },
  { value: 'MATERIAL', label: 'Material' },
];
const RELATIONSHIPS = [
  { value: 'SUPPORTS', label: 'Supports' },
  { value: 'CONTRADICTS', label: 'Contradicts' },
  { value: 'CONTEXT', label: 'Context' },
  { value: 'UNDETERMINED', label: 'Undetermined' },
];

const CUSTODY_LABEL: Record<string, string> = {
  HELD: 'Held', SUPERSEDED: 'Superseded', WITHDRAWN: 'Withdrawn', RELEASED: 'Released',
};

export function EvidenceWorkspace({ complaintId, workspace }: Props) {
  const { evidence, allegations, capabilities } = workspace;
  const canManage = capabilities.can_manage_evidence;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    label: '', description: '', source_type: 'REGULATOR', source_party: '',
    document_type: '', confidentiality: 'INTERNAL', content_hash: '', privileged: false, personal_data: false,
  });

  const registerMut = useInvestigationMutation(complaintId, () =>
    investigationOps.evidenceRegister(complaintId, draft),
  );
  const assessMut = useInvestigationMutation(
    complaintId,
    (a: { id: string; reliability: string; relevance: string; rationale: string | null; rv: number }) =>
      investigationOps.evidenceAssess(a.id, a.reliability, a.relevance, a.rationale, a.rv),
  );
  const linkMut = useInvestigationMutation(
    complaintId,
    (a: { id: string; allegationId: string; relationship: string; note: string | null }) =>
      investigationOps.evidenceLinkAllegation(a.id, a.allegationId, a.relationship, a.note),
  );
  const unlinkMut = useInvestigationMutation(complaintId, (a: { id: string; allegationId: string; reason: string }) =>
    investigationOps.evidenceUnlinkAllegation(a.id, a.allegationId, a.reason),
  );
  const withdrawMut = useInvestigationMutation(complaintId, (a: { id: string; reason: string }) =>
    investigationOps.evidenceWithdraw(a.id, a.reason),
  );

  const run = async (p: Promise<unknown>, ok: string) => {
    try { await p; toast.success(ok); } catch (e: any) { toast.error(e?.message ?? 'That could not be saved'); }
  };

  const unlinked = evidence.filter((e) => e.custody_state === 'HELD' && e.links.length === 0).length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><FileSearch className="h-4 w-4" />Evidence register</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {evidence.length} item{evidence.length === 1 ? '' : 's'} on record
            {unlinked > 0 && ` · ${unlinked} not yet linked to an allegation`}.
            {!capabilities.sees_restricted_evidence && ' Restricted and privileged items are hidden from your view.'}
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant={adding ? 'outline' : 'default'} onClick={() => setAdding((v) => !v)}>
            <Plus className="h-3.5 w-3.5 mr-1" />{adding ? 'Cancel' : 'Register evidence'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && canManage && (
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="ev-label" className="text-xs">Label</Label>
              <Input id="ev-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ev-desc" className="text-xs">Description</Label>
              <Textarea id="ev-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Where it came from</Label>
              <Select value={draft.source_type} onValueChange={(v) => setDraft({ ...draft, source_type: v })}>
                <SelectTrigger aria-label="Evidence source type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ev-party" className="text-xs">Provided by</Label>
              <Input id="ev-party" value={draft.source_party} onChange={(e) => setDraft({ ...draft, source_party: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-doc" className="text-xs">Document type</Label>
              <Input id="ev-doc" value={draft.document_type} onChange={(e) => setDraft({ ...draft, document_type: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Confidentiality</Label>
              <Select value={draft.confidentiality} onValueChange={(v) => setDraft({ ...draft, confidentiality: v })}>
                <SelectTrigger aria-label="Confidentiality"><SelectValue /></SelectTrigger>
                <SelectContent>{CONFIDENTIALITY.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ev-hash" className="text-xs">Integrity hash (optional)</Label>
              <Input id="ev-hash" value={draft.content_hash} onChange={(e) => setDraft({ ...draft, content_hash: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={draft.privileged} onCheckedChange={(v) => setDraft({ ...draft, privileged: Boolean(v) })} />
              Legally privileged
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={draft.personal_data} onCheckedChange={(v) => setDraft({ ...draft, personal_data: Boolean(v) })} />
              Contains personal data
            </label>
            <div className="sm:col-span-2">
              <Button
                data-rbac="complaint_management.investigate"
                size="sm"
                disabled={registerMut.isPending}
                onClick={async () => {
                  await run(registerMut.mutateAsync(undefined as never), 'Evidence registered');
                  setAdding(false);
                  setDraft({
                    label: '', description: '', source_type: 'REGULATOR', source_party: '',
                    document_type: '', confidentiality: 'INTERNAL', content_hash: '', privileged: false, personal_data: false,
                  });
                }}
              >
                {registerMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Register evidence
              </Button>
            </div>
          </div>
        )}

        <SectionState
          isLoading={false}
          isError={false}
          isEmpty={evidence.length === 0}
          noun="evidence items"
          emptyText="No evidence has been registered for this investigation yet."
        >
          <ul className="space-y-3">
            {evidence.map((e) => (
              <EvidenceRow
                key={e.id}
                item={e}
                allegations={allegations.map((a) => ({ id: a.id, number: a.allegation_number, title: a.title }))}
                canManage={canManage}
                onAssess={(reliability, relevance, rationale) =>
                  run(assessMut.mutateAsync({ id: e.id, reliability, relevance, rationale, rv: e.row_version }), 'Assessment saved')}
                onLink={(allegationId, relationship, note) =>
                  run(linkMut.mutateAsync({ id: e.id, allegationId, relationship, note }), 'Evidence linked')}
                onUnlink={(allegationId, reason) =>
                  run(unlinkMut.mutateAsync({ id: e.id, allegationId, reason }), 'Link removed')}
                onWithdraw={(reason) => run(withdrawMut.mutateAsync({ id: e.id, reason }), 'Evidence withdrawn')}
              />
            ))}
          </ul>
        </SectionState>
      </CardContent>
    </Card>
  );
}

function EvidenceRow({
  item: e, allegations, canManage, onAssess, onLink, onUnlink, onWithdraw,
}: {
  item: EvidenceItem;
  allegations: Array<{ id: string; number: number; title: string }>;
  canManage: boolean;
  onAssess: (reliability: string, relevance: string, rationale: string | null) => void;
  onLink: (allegationId: string, relationship: string, note: string | null) => void;
  onUnlink: (allegationId: string, reason: string) => void;
  onWithdraw: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reliability, setReliability] = useState(e.reliability);
  const [relevance, setRelevance] = useState(e.relevance);
  const [rationale, setRationale] = useState(e.assessment_rationale ?? '');
  const [linkAllegation, setLinkAllegation] = useState('');
  const [relationship, setRelationship] = useState('SUPPORTS');
  const [linkNote, setLinkNote] = useState('');

  const active = e.custody_state === 'HELD';

  return (
    <li className="rounded-md border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-start justify-between gap-2 p-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{e.evidence_reference}</Badge>
              <p className="font-medium text-sm truncate">{e.label ?? 'Evidence item'}</p>
              <Badge variant={active ? 'secondary' : 'outline'}>{CUSTODY_LABEL[e.custody_state]}</Badge>
              {e.privileged && (
                <Badge variant="destructive" className="text-[10px] flex items-center gap-1">
                  <Lock className="h-3 w-3" />Privileged
                </Badge>
              )}
              {e.version > 1 && <Badge variant="outline" className="text-[10px]">v{e.version}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(e.source_type ?? '').replace(/_/g, ' ').toLowerCase()}
              {e.source_party ? ` · ${e.source_party}` : ''}
              {e.received_at ? ` · received ${formatDateTime(e.received_at)}` : ''}
              {` · reliability ${e.reliability.toLowerCase().replace(/_/g, ' ')}`}
              {` · relevance ${e.relevance.toLowerCase().replace(/_/g, ' ')}`}
            </p>
            {e.links.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {e.links.map((l) => (
                  <Badge key={`${l.allegation_id}-${l.relationship_type}`} variant="outline" className="text-[10px]">
                    A{l.allegation_number} · {RELATIONSHIPS.find((r) => r.value === l.relationship_type)?.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Toggle evidence detail">
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="space-y-4 border-t p-3 text-sm">
            {e.description && <p className="whitespace-pre-wrap">{e.description}</p>}
            {e.content_hash && (
              <p className="font-mono text-[11px] text-muted-foreground break-all">Integrity hash: {e.content_hash}</p>
            )}

            {canManage && active && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-medium">Assess this evidence</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={reliability} onValueChange={(v) => setReliability(v as EvidenceItem['reliability'])}>
                    <SelectTrigger aria-label="Reliability"><SelectValue /></SelectTrigger>
                    <SelectContent>{RELIABILITY.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={relevance} onValueChange={(v) => setRelevance(v as EvidenceItem['relevance'])}>
                    <SelectTrigger aria-label="Relevance"><SelectValue /></SelectTrigger>
                    <SelectContent>{RELEVANCE.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Textarea
                  aria-label="Assessment rationale"
                  rows={2}
                  placeholder="Rationale (optional)"
                  value={rationale}
                  onChange={(ev) => setRationale(ev.target.value)}
                />
                <Button
                  data-rbac="complaint_management.investigate"
                  size="sm"
                  variant="outline"
                  onClick={() => onAssess(reliability, relevance, rationale.trim() || null)}
                >
                  Save assessment
                </Button>
              </div>
            )}

            {canManage && active && allegations.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-medium flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" />Link to an allegation</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select value={linkAllegation} onValueChange={setLinkAllegation}>
                    <SelectTrigger aria-label="Allegation"><SelectValue placeholder="Allegation" /></SelectTrigger>
                    <SelectContent>
                      {allegations.map((a) => (
                        <SelectItem key={a.id} value={a.id}>A{a.number} — {a.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={relationship} onValueChange={setRelationship}>
                    <SelectTrigger aria-label="Relationship"><SelectValue /></SelectTrigger>
                    <SelectContent>{RELATIONSHIPS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input aria-label="Relevance note" placeholder="Note (optional)" value={linkNote} onChange={(ev) => setLinkNote(ev.target.value)} />
                </div>
                <Button
                  data-rbac="complaint_management.investigate"
                  size="sm"
                  variant="outline"
                  disabled={!linkAllegation}
                  onClick={() => { onLink(linkAllegation, relationship, linkNote.trim() || null); setLinkNote(''); }}
                >
                  Link evidence
                </Button>
              </div>
            )}

            {canManage && active && e.links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {e.links.map((l) => (
                  <Button
                    data-rbac="complaint_management.investigate"
                    key={`unlink-${l.allegation_id}`}
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={async () => {
                      const res = await Swal.fire({
                        title: `Remove the link to A${l.allegation_number}?`,
                        input: 'text',
                        inputLabel: 'Reason',
                        inputValidator: (v) => (String(v ?? '').trim().length < 5 ? 'Give a short reason' : undefined),
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Remove link',
                      });
                      if (res.isConfirmed) onUnlink(l.allegation_id, String(res.value).trim());
                    }}
                  >
                    <Unlink className="h-3 w-3 mr-1" />Unlink A{l.allegation_number}
                  </Button>
                ))}
              </div>
            )}

            {canManage && active && (
              <Button
                data-rbac="complaint_management.investigate"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  const res = await Swal.fire({
                    title: 'Withdraw this evidence?',
                    text: 'The item stays on record with a withdrawn custody state. Nothing is deleted.',
                    input: 'textarea',
                    inputLabel: 'Reason',
                    inputValidator: (v) => (String(v ?? '').trim().length < 5 ? 'Give a short reason' : undefined),
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Withdraw evidence',
                  });
                  if (res.isConfirmed) onWithdraw(String(res.value).trim());
                }}
              >
                Withdraw evidence
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export default EvidenceWorkspace;
