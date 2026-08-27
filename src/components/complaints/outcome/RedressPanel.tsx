/**
 * MC-04 — Individual consumer redress.
 *
 * Redress types, and whether an amount, due date or completion evidence is
 * needed, are business configuration. Every change goes through the governed
 * redress functions; completion and verification are deliberately separate so a
 * different officer confirms the remedy was actually delivered.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, Check, ShieldCheck, Ban, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime, formatDateOnly } from '@/lib/datetime';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import {
  useComplaintOutcome,
  redressStatusLabel,
  redressStatusVariant,
  formatMoney,
  type RedressRow,
} from '@/hooks/useComplaintOutcome';

interface Props { complaintId: string }

interface Draft {
  id?: string;
  redress_type_id: string;
  affected_party_label: string;
  allegation_id: string;
  amount: string;
  currency: string;
  action_required: string;
  responsible_entity: string;
  due_date: string;
  is_required: boolean;
  rationale: string;
  expected_row_version?: number;
}

const EMPTY: Draft = {
  redress_type_id: '', affected_party_label: '', allegation_id: '', amount: '', currency: 'JMD',
  action_required: '', responsible_entity: '', due_date: '', is_required: true, rationale: '',
};

export function RedressPanel({ complaintId }: Props) {
  const { outcomeQ, redressQ, redressTypesQ, saveRedress, completeRedress, verifyRedress, cancelRedress } =
    useComplaintOutcome(complaintId);

  const rows = redressQ.data ?? [];
  const types = redressTypesQ.data ?? [];
  const allegations = outcomeQ.data?.allegations ?? [];
  const outcome = outcomeQ.data?.outcome ?? null;
  const gateOpen = !!outcomeQ.data?.gate?.ok;

  const [editing, setEditing] = useState<Draft | null>(null);
  const [noteFor, setNoteFor] = useState<{ row: RedressRow; mode: 'complete' | 'verify' | 'cancel' } | null>(null);
  const [note, setNote] = useState('');

  const selectedType = types.find((t) => t.id === editing?.redress_type_id);

  const onError = (e: any) => {
    const m = String(e?.message ?? '');
    const map: Record<string, string> = {
      redress_type_required: 'Select the type of redress.',
      affected_party_required: 'Record who the redress is for.',
      action_required_required: 'Describe the action required.',
      amount_required: 'This type of redress needs an amount.',
      due_date_required: 'This type of redress needs a due date.',
      completion_evidence_required: 'Describe the evidence that the redress was delivered.',
      verification_note_required: 'Add a short verification note.',
      redress_not_completed: 'The item must be marked complete before it can be verified.',
      redress_locked: 'This item is already verified or cancelled and cannot be changed.',
      reason_required: 'A reason is required.',
      stale_state: 'This item changed elsewhere. Reload before continuing.',
    };
    const hit = Object.keys(map).find((k) => m.includes(k));
    toast.error(hit ? map[hit] : m || 'Action failed');
  };

  const submitDraft = () => {
    if (!editing) return;
    const payload: Record<string, unknown> = {
      id: editing.id ?? null,
      redress_type_id: editing.redress_type_id,
      affected_party_label: editing.affected_party_label,
      allegation_id: editing.allegation_id || null,
      amount: editing.amount || null,
      currency: editing.currency || null,
      action_required: editing.action_required,
      responsible_entity: editing.responsible_entity || null,
      due_date: editing.due_date || null,
      is_required: editing.is_required,
      rationale: editing.rationale || null,
      expected_row_version: editing.expected_row_version ?? null,
    };
    saveRedress.mutate(payload, {
      onError,
      onSuccess: () => { toast.success(editing.id ? 'Redress item updated' : 'Redress item added'); setEditing(null); },
    });
  };

  const runNoteAction = () => {
    if (!noteFor) return;
    const { row, mode } = noteFor;
    const done = (msg: string) => { toast.success(msg); setNoteFor(null); setNote(''); };
    if (mode === 'complete') completeRedress.mutate({ id: row.id, note, rowVersion: row.row_version }, { onError, onSuccess: () => done('Marked as completed — awaiting verification') });
    if (mode === 'verify') verifyRedress.mutate({ id: row.id, note, rowVersion: row.row_version }, { onError, onSuccess: () => done('Redress verified') });
    if (mode === 'cancel') cancelRedress.mutate({ id: row.id, reason: note }, { onError, onSuccess: () => done('Redress item cancelled') });
  };

  if (redressQ.isLoading || redressTypesQ.isLoading) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading redress…</CardContent></Card>;
  }
  if (redressQ.isError) return <QueryErrorState title="Failed to load redress" error={redressQ.error} onRetry={() => redressQ.refetch()} />;

  const canAdd = gateOpen && outcome?.status !== 'SUBMITTED';
  const totalMonetary = rows.filter((r) => r.status !== 'CANCELLED').reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base">Consumer redress</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Remedies for the affected consumer. Required items must be completed and verified before the complaint can be closed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {totalMonetary > 0 && <Badge variant="outline">Total {formatMoney(totalMonetary, rows.find((r) => r.currency)?.currency)}</Badge>}
            <Button data-rbac="complaint_management.create" size="sm" disabled={!canAdd} onClick={() => setEditing({ ...EMPTY })}>
              <Plus className="mr-1 h-3.5 w-3.5" />Add redress
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          {!gateOpen && (
            <p className="mb-3 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Redress can be recorded once outcome review is open for this complaint.
            </p>
          )}
          {outcome?.status === 'SUBMITTED' && (
            <p className="mb-3 flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />The outcome is complete. Existing items can still be completed and verified, but no new items can be added.
            </p>
          )}

          {rows.length === 0 ? (
            <p className="text-muted-foreground">
              No redress has been recorded for this complaint. Where no redress is required, record the reason on the outcome.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => {
                const t = r.complaint_redress_types;
                const alleg = allegations.find((a) => a.allegation_id === r.allegation_id);
                const locked = r.status === 'VERIFIED' || r.status === 'CANCELLED';
                return (
                  <li key={r.id} className="space-y-2 py-3 first:pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t?.label || 'Redress'}</span>
                      {!r.is_required && <Badge variant="outline" className="text-xs">Discretionary</Badge>}
                      <Badge variant={redressStatusVariant(r.status)} className="ml-auto">{redressStatusLabel(r.status)}</Badge>
                    </div>
                    <dl className="grid gap-2 text-xs sm:grid-cols-3">
                      <div><dt className="text-muted-foreground">For</dt><dd>{r.affected_party_label}</dd></div>
                      <div><dt className="text-muted-foreground">Allegation</dt><dd>{alleg ? `Allegation ${alleg.allegation_number} — ${alleg.title}` : 'Not linked'}</dd></div>
                      <div><dt className="text-muted-foreground">Amount</dt><dd className="font-mono">{formatMoney(r.amount, r.currency)}</dd></div>
                      <div><dt className="text-muted-foreground">Responsible</dt><dd>{r.responsible_entity || '—'}</dd></div>
                      <div><dt className="text-muted-foreground">Due</dt><dd>{r.due_date ? formatDateOnly(r.due_date) : '—'}</dd></div>
                      <div><dt className="text-muted-foreground">Verified</dt><dd>{r.verified_at ? formatDateTime(r.verified_at) : 'Not yet verified'}</dd></div>
                    </dl>
                    <div><p className="text-xs text-muted-foreground">Action required</p><p className="whitespace-pre-wrap">{r.action_required}</p></div>
                    {r.completion_note && <div><p className="text-xs text-muted-foreground">Evidence of completion</p><p className="whitespace-pre-wrap text-xs">{r.completion_note}</p></div>}
                    {r.verification_note && <div><p className="text-xs text-muted-foreground">Officer verification</p><p className="whitespace-pre-wrap text-xs">{r.verification_note}</p></div>}
                    {r.cancelled_reason && <div><p className="text-xs text-muted-foreground">Reason for cancellation</p><p className="whitespace-pre-wrap text-xs">{r.cancelled_reason}</p></div>}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button data-rbac="complaint_management.edit" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={locked}
                        onClick={() => setEditing({
                          id: r.id,
                          redress_type_id: r.redress_type_id ?? '',
                          affected_party_label: r.affected_party_label,
                          allegation_id: r.allegation_id ?? '',
                          amount: r.amount != null ? String(r.amount) : '',
                          currency: r.currency ?? 'JMD',
                          action_required: r.action_required,
                          responsible_entity: r.responsible_entity ?? '',
                          due_date: r.due_date ?? '',
                          is_required: r.is_required,
                          rationale: r.rationale ?? '',
                          expected_row_version: r.row_version,
                        })}>
                        <Pencil className="mr-1 h-3 w-3" />Edit
                      </Button>
                      <Button data-rbac="complaint_management.edit" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={locked || r.status === 'COMPLETED'}
                        onClick={() => { setNote(''); setNoteFor({ row: r, mode: 'complete' }); }}>
                        <Check className="mr-1 h-3 w-3" />Mark completed
                      </Button>
                      <Button data-rbac="complaint_management.edit" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={r.status !== 'COMPLETED'}
                        onClick={() => { setNote(''); setNoteFor({ row: r, mode: 'verify' }); }}>
                        <ShieldCheck className="mr-1 h-3 w-3" />Verify
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={locked}
                        onClick={() => { setNote(''); setNoteFor({ row: r, mode: 'cancel' }); }}>
                        <Ban className="mr-1 h-3 w-3" />Cancel
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- add / edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit redress item' : 'Add redress item'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Type of redress</Label>
                <Select value={editing.redress_type_id || 'none'} onValueChange={(v) => setEditing({ ...editing, redress_type_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select the type of redress" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not selected</SelectItem>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label} — {t.category === 'MONETARY' ? 'monetary' : 'non-monetary'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedType?.description && <p className="mt-1 text-xs text-muted-foreground">{selectedType.description}</p>}
              </div>
              <div>
                <Label>Who the redress is for</Label>
                <Input value={editing.affected_party_label} onChange={(e) => setEditing({ ...editing, affected_party_label: e.target.value })} placeholder="Name of the affected consumer" />
              </div>
              <div>
                <Label>Related allegation</Label>
                <Select value={editing.allegation_id || 'none'} onValueChange={(v) => setEditing({ ...editing, allegation_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked to an allegation</SelectItem>
                    {allegations.map((a) => (
                      <SelectItem key={a.allegation_id} value={a.allegation_id}>Allegation {a.allegation_number} — {a.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedType?.requires_amount !== false && (
                <>
                  <div>
                    <Label>Amount{selectedType?.requires_amount ? '' : ' (if applicable)'}</Label>
                    <Input type="number" min="0" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Input value={editing.currency} onChange={(e) => setEditing({ ...editing, currency: e.target.value })} placeholder="JMD" />
                  </div>
                </>
              )}
              <div>
                <Label>Responsible entity</Label>
                <Input value={editing.responsible_entity} onChange={(e) => setEditing({ ...editing, responsible_entity: e.target.value })} placeholder="Who must deliver the remedy" />
              </div>
              <div>
                <Label>Due date{selectedType?.requires_due_date ? '' : ' (if applicable)'}</Label>
                <Input type="date" value={editing.due_date} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Action required</Label>
                <Textarea rows={3} value={editing.action_required} onChange={(e) => setEditing({ ...editing, action_required: e.target.value })} placeholder="What must be done for the consumer." />
              </div>
              <div className="sm:col-span-2">
                <Label>Reason for this redress</Label>
                <Textarea rows={2} value={editing.rationale} onChange={(e) => setEditing({ ...editing, rationale: e.target.value })} placeholder="Optional — why this remedy is appropriate." />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2">
                <div>
                  <Label className="text-sm">Required before closure</Label>
                  <p className="text-xs text-muted-foreground">Required items block closure until completed and verified.</p>
                </div>
                <Switch checked={editing.is_required} onCheckedChange={(v) => setEditing({ ...editing, is_required: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button data-rbac="complaint_management.edit" onClick={submitDraft} disabled={saveRedress.isPending}>
              {saveRedress.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------- complete / verify / cancel */}
      <Dialog open={!!noteFor} onOpenChange={(o) => !o && setNoteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {noteFor?.mode === 'complete' ? 'Mark redress completed' : noteFor?.mode === 'verify' ? 'Verify redress' : 'Cancel redress item'}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label>
              {noteFor?.mode === 'complete' ? 'Evidence that the redress was delivered'
                : noteFor?.mode === 'verify' ? 'Verification note'
                : 'Reason for cancellation'}
            </Label>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            {noteFor?.mode === 'verify' && (
              <p className="mt-1 text-xs text-muted-foreground">Verification must be carried out by an officer other than the one who recorded completion.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteFor(null)}>Close</Button>
            <Button onClick={runNoteAction} disabled={completeRedress.isPending || verifyRedress.isPending || cancelRedress.isPending}>
              {(completeRedress.isPending || verifyRedress.isPending || cancelRedress.isPending) && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RedressPanel;
