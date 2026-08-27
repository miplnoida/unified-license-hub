import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CalendarClock, ShieldCheck } from 'lucide-react';
import {
  useRecordActionVerification, useExtendActionDueDate, useSetActionFollowUp,
  type ThematicVerificationStatus,
} from '@/hooks/useThematicClosure';

const VERIF_LABEL: Record<string, string> = {
  pending: 'Pending', evidence_received: 'Evidence received', verified: 'Verified', not_satisfied: 'Not satisfied',
};
const VERIF_VARIANT: Record<string, any> = {
  pending: 'outline', evidence_received: 'secondary', verified: 'default', not_satisfied: 'destructive',
};

interface Props { reviewId: string; rows: any[]; onChange: () => void }

export function ThematicFollowUpRegister({ reviewId, rows, onChange }: Props) {
  const verify = useRecordActionVerification(reviewId);
  const extend = useExtendActionDueDate(reviewId);
  const setFollowUp = useSetActionFollowUp(reviewId);

  const [verifyTarget, setVerifyTarget] = useState<any | null>(null);
  const [vStatus, setVStatus] = useState<ThematicVerificationStatus>('evidence_received');
  const [vNotes, setVNotes] = useState('');
  const [vEvidence, setVEvidence] = useState('');

  const [extendTarget, setExtendTarget] = useState<any | null>(null);
  const [newDue, setNewDue] = useState('');
  const [extReason, setExtReason] = useState('');

  const [followTarget, setFollowTarget] = useState<any | null>(null);
  const [followDate, setFollowDate] = useState('');
  const [contact, setContact] = useState('');

  const stats = useMemo(() => ({
    total: rows.length,
    verified: rows.filter(r => r.verification_status === 'verified').length,
    outstanding: rows.filter(r => r.verification_status !== 'verified' && !['waived', 'cancelled'].includes(r.status)).length,
    overdue: rows.filter(r => r.due_date && r.verification_status !== 'verified' && new Date(r.due_date) < new Date()).length,
  }), [rows]);

  const run = async (fn: () => Promise<unknown>, ok: string, close: () => void) => {
    try { await fn(); toast.success(ok); close(); onChange(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Actions" value={stats.total} />
        <Stat label="Verified" value={stats.verified} />
        <Stat label="Outstanding" value={stats.outstanding} tone={stats.outstanding > 0 ? 'warn' : undefined} />
        <Stat label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? 'bad' : undefined} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Follow-up register</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No required actions recorded for this review.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Due</TableHead>
                <TableHead>Follow-up</TableHead><TableHead>Verification</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map(a => {
                const overdue = a.due_date && a.verification_status !== 'verified' && new Date(a.due_date) < new Date();
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{a.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.action_type}{a.extension_count > 0 && ` · extended ${a.extension_count}×`}
                        {a.entity_contact && ` · contact: ${a.entity_contact}`}
                      </div>
                      {a.verification_notes && <div className="text-xs text-muted-foreground mt-0.5">Note: {a.verification_notes}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{a.licensees?.name || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}
                      {overdue && <Badge variant="destructive" className="ml-1">Overdue</Badge>}
                      {a.original_due_date && a.original_due_date !== a.due_date && (
                        <div className="text-muted-foreground">was {new Date(a.original_due_date).toLocaleDateString()}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{a.follow_up_due_date ? new Date(a.follow_up_due_date).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={VERIF_VARIANT[a.verification_status] || 'outline'}>{VERIF_LABEL[a.verification_status] || a.verification_status}</Badge>
                      {a.verified_at && <div className="text-xs text-muted-foreground mt-0.5">{new Date(a.verified_at).toLocaleDateString()}</div>}
                    </TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                        onClick={() => { setVerifyTarget(a); setVStatus('evidence_received'); setVNotes(a.verification_notes || ''); setVEvidence(a.evidence_of_completion || ''); }}>
                        <ShieldCheck className="h-4 w-4 mr-1" /> Verify
                      </Button>
                      <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost"
                        onClick={() => { setExtendTarget(a); setNewDue(a.due_date || ''); setExtReason(''); }}>
                        Extend
                      </Button>
                      <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost"
                        onClick={() => { setFollowTarget(a); setFollowDate(a.follow_up_due_date || ''); setContact(a.entity_contact || ''); }}>
                        <CalendarClock className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Verification */}
      <Dialog open={!!verifyTarget} onOpenChange={o => !o && setVerifyTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Verify: {verifyTarget?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Verification outcome</Label>
              <select className="w-full h-10 rounded-md border bg-background px-3" value={vStatus} onChange={e => setVStatus(e.target.value as ThematicVerificationStatus)}>
                <option value="pending">Pending</option>
                <option value="evidence_received">Evidence received</option>
                <option value="verified">Verified — action complete</option>
                <option value="not_satisfied">Not satisfied</option>
              </select>
            </div>
            <div><Label>Evidence (URL, document reference or note)</Label><Input value={vEvidence} onChange={e => setVEvidence(e.target.value)} /></div>
            <div><Label>Verification notes {['verified', 'not_satisfied'].includes(vStatus) && '(min 10 characters)'}</Label>
              <Textarea rows={3} value={vNotes} onChange={e => setVNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyTarget(null)}>Cancel</Button>
            <Button data-rbac="prudential_supervision.edit"
              disabled={['verified', 'not_satisfied'].includes(vStatus) && vNotes.trim().length < 10}
              onClick={() => run(() => verify.mutateAsync({
                _action_id: verifyTarget.id, _verification_status: vStatus,
                _notes: vNotes.trim() || null, _evidence: vEvidence.trim() || null,
              }), 'Verification recorded', () => setVerifyTarget(null))}>
              Save verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extension */}
      <Dialog open={!!extendTarget} onOpenChange={o => !o && setExtendTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extend due date: {extendTarget?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>New due date</Label><Input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} /></div>
            <div><Label>Justification (min 10 characters)</Label><Textarea rows={3} value={extReason} onChange={e => setExtReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)}>Cancel</Button>
            <Button data-rbac="prudential_supervision.edit" disabled={!newDue || extReason.trim().length < 10}
              onClick={() => run(() => extend.mutateAsync({ _action_id: extendTarget.id, _new_due_date: newDue, _reason: extReason.trim() }),
                'Due date extended', () => setExtendTarget(null))}>
              Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up schedule */}
      <Dialog open={!!followTarget} onOpenChange={o => !o && setFollowTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Follow-up schedule: {followTarget?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Next follow-up date</Label><Input type="date" value={followDate} onChange={e => setFollowDate(e.target.value)} /></div>
            <div><Label>Entity contact</Label><Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Name / email of responsible contact" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowTarget(null)}>Cancel</Button>
            <Button data-rbac="prudential_supervision.edit" onClick={() => run(() => setFollowUp.mutateAsync({
              _action_id: followTarget.id,
              _follow_up_due_date: followDate || null,
              _responsible_officer_id: followTarget.responsible_officer_id || null,
              _entity_contact: contact || null,
            }), 'Follow-up schedule saved', () => setFollowTarget(null))}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  return (
    <Card><CardContent className="pt-6">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-amber-600' : ''}`}>{value}</p>
    </CardContent></Card>
  );
}
