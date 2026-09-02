/**
 * Governed action dialogs for the Document Register / Document Detail screens.
 *
 * Every dialog calls an existing governed DMS service function. Nothing here
 * writes to a table, derives a business value, or bypasses a server refusal —
 * failures are surfaced through `describeDmsError`.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  acceptDocument, classifyDocument, describeDmsError, linkDocumentToRecord,
  updateDocumentMetadata, verifyDocument,
  type DmsConfidentiality, type DmsPublicationEligibility,
} from '@/services/dms';
import {
  CONFIDENTIALITY_OPTIONS, DMS_CONTEXT_TYPES, PUBLICATION_OPTIONS,
} from '@/lib/presentation/dmsLabels';
import { useDmsRetentionPolicies, useDmsTaxonomy } from '@/hooks/useDmsDocuments';

const NONE = 'none';
const unset = (v: string) => (v === NONE ? null : v);

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onDone: () => void;
}

/* ------------------------------------------------------------- edit details */

export function DocumentDetailsDialog({
  open, onOpenChange, groupId, onDone, initial,
}: BaseProps & {
  initial: {
    displayName?: string | null; documentDate?: string | null;
    effectiveFrom?: string | null; effectiveUntil?: string | null; expiryDate?: string | null;
    reportingPeriodStart?: string | null; reportingPeriodEnd?: string | null; tags?: string[] | null;
  };
}) {
  const [form, setForm] = useState(initial);
  const [tags, setTags] = useState((initial.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setForm(initial); setTags((initial.tags ?? []).join(', ')); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    setSaving(true);
    const res = await updateDocumentMetadata(groupId, {
      displayName: form.displayName || null,
      documentDate: form.documentDate || null,
      effectiveFrom: form.effectiveFrom || null,
      effectiveUntil: form.effectiveUntil || null,
      expiryDate: form.expiryDate || null,
      reportingPeriodStart: form.reportingPeriodStart || null,
      reportingPeriodEnd: form.reportingPeriodEnd || null,
      tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : null,
    });
    setSaving(false);
    if (!res.success) { toast.error(describeDmsError(res.error)); return; }
    toast.success('Document details updated');
    onOpenChange(false);
    onDone();
  };

  const field = (key: keyof typeof form, label: string, type = 'date') => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={(form[key] as string) ?? ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit document details</DialogTitle>
          <DialogDescription>Business details only. The file itself is never changed here.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Document name</Label>
            <Input
              value={form.displayName ?? ''}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Name shown to users"
            />
          </div>
          {field('documentDate', 'Document date')}
          {field('expiryDate', 'Expires on')}
          {field('effectiveFrom', 'Effective from')}
          {field('effectiveUntil', 'Effective until')}
          {field('reportingPeriodStart', 'Reporting period start')}
          {field('reportingPeriodEnd', 'Reporting period end')}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tags</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma separated" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save details'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- classify */

export function ClassifyDocumentDialog({
  open, onOpenChange, groupId, onDone, initial,
}: BaseProps & {
  initial: {
    categoryCode?: string | null; typeCode?: string | null;
    confidentiality?: string | null; publicationEligibility?: string | null; retentionPolicyCode?: string | null;
  };
}) {
  const { data: taxonomy } = useDmsTaxonomy();
  const { data: policies } = useDmsRetentionPolicies();
  const [category, setCategory] = useState(initial.categoryCode ?? NONE);
  const [type, setType] = useState(initial.typeCode ?? NONE);
  const [confidentiality, setConfidentiality] = useState(initial.confidentiality ?? NONE);
  const [publication, setPublication] = useState(initial.publicationEligibility ?? NONE);
  const [retention, setRetention] = useState(initial.retentionPolicyCode ?? NONE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(initial.categoryCode ?? NONE);
    setType(initial.typeCode ?? NONE);
    setConfidentiality(initial.confidentiality ?? NONE);
    setPublication(initial.publicationEligibility ?? NONE);
    setRetention(initial.retentionPolicyCode ?? NONE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const categoryId = taxonomy?.categories.find((c) => c.code === category)?.id;
  const typeOptions = (taxonomy?.types ?? []).filter((t) => !categoryId || t.category_id === categoryId);

  const save = async () => {
    setSaving(true);
    const res = await classifyDocument(groupId, {
      categoryCode: unset(category),
      typeCode: unset(type),
      confidentiality: unset(confidentiality) as DmsConfidentiality | null,
      publicationEligibility: unset(publication) as DmsPublicationEligibility | null,
      retentionPolicyCode: unset(retention),
    });
    setSaving(false);
    if (!res.success) { toast.error(describeDmsError(res.error)); return; }
    toast.success('Classification updated');
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Classify document</DialogTitle>
          <DialogDescription>
            Category and type set the default sensitivity and retention. Defaults are only recalculated where no
            explicit choice has been recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v); setType(NONE); }}>
              <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Leave unchanged</SelectItem>
                {(taxonomy?.categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Document type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Leave unchanged</SelectItem>
                {typeOptions.map((t) => <SelectItem key={t.id} value={t.code}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Sensitivity</Label>
            <Select value={confidentiality} onValueChange={setConfidentiality}>
              <SelectTrigger><SelectValue placeholder="Select sensitivity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Leave unchanged</SelectItem>
                {CONFIDENTIALITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Publication</Label>
            <Select value={publication} onValueChange={setPublication}>
              <SelectTrigger><SelectValue placeholder="Select publication handling" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Leave unchanged</SelectItem>
                {PUBLICATION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Retention policy</Label>
            <Select value={retention} onValueChange={setRetention}>
              <SelectTrigger><SelectValue placeholder="Select retention policy" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Leave unchanged</SelectItem>
                {(policies ?? []).map((p) => <SelectItem key={p.id} value={p.code}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save classification'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------- verification / acceptance */

type DecisionKind = 'verification' | 'acceptance';

const DECISIONS: Record<DecisionKind, Array<{ value: string; label: string }>> = {
  verification: [
    { value: 'verified', label: 'Verified' },
    { value: 'rejected', label: 'Rejected — not acceptable' },
    { value: 'pending', label: 'Return to awaiting verification' },
  ],
  acceptance: [
    { value: 'accepted', label: 'Accepted' },
    { value: 'conditionally_accepted', label: 'Accepted with conditions' },
    { value: 'rejected', label: 'Not accepted' },
    { value: 'pending', label: 'Return to awaiting acceptance' },
  ],
};

export function DocumentDecisionDialog({
  open, onOpenChange, groupId, onDone, kind,
}: BaseProps & { kind: DecisionKind }) {
  const [decision, setDecision] = useState(DECISIONS[kind][0].value);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setDecision(DECISIONS[kind][0].value); setNote(''); } }, [open, kind]);

  const save = async () => {
    setSaving(true);
    const res = kind === 'verification'
      ? await verifyDocument(groupId, decision as 'verified' | 'rejected' | 'pending', note || undefined)
      : await acceptDocument(groupId, decision as 'accepted' | 'conditionally_accepted' | 'rejected' | 'pending', note || undefined);
    setSaving(false);
    if (!res.success) { toast.error(describeDmsError(res.error)); return; }
    toast.success(kind === 'verification' ? 'Verification recorded' : 'Acceptance decision recorded');
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === 'verification' ? 'Record verification' : 'Record acceptance decision'}</DialogTitle>
          <DialogDescription>
            {kind === 'verification'
              ? 'Confirm whether the document is a genuine, complete and legible record.'
              : 'Confirm whether the document satisfies the regulatory requirement it was provided for.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Decision</Label>
            <Select value={decision} onValueChange={setDecision}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DECISIONS[kind].map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason / note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Recorded in the document audit trail" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Recording…' : 'Record decision'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------- link record */

export function LinkRecordDialog({ open, onOpenChange, groupId, onDone }: BaseProps) {
  const [targetType, setTargetType] = useState(DMS_CONTEXT_TYPES[0].value);
  const [targetId, setTargetId] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setTargetId(''); setReference(''); } }, [open]);

  const save = async () => {
    if (!targetId.trim()) { toast.error('Enter the record this document belongs to'); return; }
    setSaving(true);
    const res = await linkDocumentToRecord({
      groupId,
      targetType,
      targetId: targetId.trim(),
      targetReference: reference.trim() || null,
    });
    setSaving(false);
    if (!res.success) { toast.error(describeDmsError(res.error)); return; }
    toast.success('Document linked to the record');
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link to a regulatory record</DialogTitle>
          <DialogDescription>
            The same document is attached to another record. No copy is created and the document keeps its reference.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Record type</Label>
            <Select value={targetType} onValueChange={setTargetType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DMS_CONTEXT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Record identifier</Label>
            <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="Paste the record identifier from its screen" />
          </div>
          <div className="space-y-1.5">
            <Label>Record reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. APP-2026-0142" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Linking…' : 'Link document'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
