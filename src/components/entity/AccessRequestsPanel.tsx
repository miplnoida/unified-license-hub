import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, UserPlus, UserCog, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatDateOnly } from '@/lib/datetime';
import {
  AccessRequestType, REQUEST_TYPE_LABEL, STATUS_LABEL, listAccessRequests, submitAccessRequest,
  uploadAccessFile, withdrawAccessRequest, openAccessFile,
} from '@/lib/entityAccessRequests';

interface Member { id: string; full_name: string | null; email: string | null; role: string | null; is_primary: boolean | null; status: string }

export function AccessRequestsPanel({ entityId, members, currentUserEmail }: { entityId: string; members: Member[]; currentUserEmail?: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<null | 'secondary' | 'primary'>(null);
  const isPrimary = members.some((m) => m.is_primary && m.status === 'APPROVED' && m.email?.toLowerCase() === currentUserEmail?.toLowerCase());

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['entity-access-requests', entityId],
    queryFn: () => listAccessRequests(entityId),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['entity-access-requests', entityId] });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">User access requests</CardTitle>
        <div className="flex gap-2">
          {isPrimary && <Button size="sm" onClick={() => setOpen('secondary')}><UserPlus className="mr-1 h-4 w-4" />Request user change</Button>}
          <Button size="sm" variant="outline" onClick={() => setOpen('primary')}><UserCog className="mr-1 h-4 w-4" />Change Primary User</Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {!isPrimary && <p className="px-6 pb-3 text-xs text-muted-foreground">Only the Primary User can request to add, change or remove other users.</p>}
        <Table>
          <TableHeader><TableRow>
            <TableHead>Reference</TableHead><TableHead>Request</TableHead><TableHead>User</TableHead>
            <TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>
            ) : requests.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No requests yet</TableCell></TableRow>
            ) : requests.map((r) => {
              const target = members.find((m) => m.id === r.target_membership_id);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                  <TableCell>{REQUEST_TYPE_LABEL[r.request_type]}</TableCell>
                  <TableCell>{r.subject_full_name || target?.full_name || '—'}<div className="text-xs text-muted-foreground">{r.subject_email || target?.email}</div></TableCell>
                  <TableCell>
                    <Badge variant={r.status.startsWith('APPROVED') ? 'approved' : 'outline'}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    {r.decision_notes && <div className="mt-1 max-w-xs text-xs text-muted-foreground">{r.decision_notes}</div>}
                  </TableCell>
                  <TableCell>{formatDateOnly(r.submitted_at)}</TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => openAccessFile(r.letter_path).catch((e) => toast.error(e.message))}><FileText className="h-4 w-4" /></Button>
                    {r.status === 'SUBMITTED' && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        try { await withdrawAccessRequest(r.id); toast.success('Request withdrawn'); refresh(); } catch (e: any) { toast.error(e.message); }
                      }}>Withdraw</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      {open && (
        <RequestDialog mode={open} entityId={entityId} members={members} onClose={() => setOpen(null)} onDone={() => { setOpen(null); refresh(); }} />
      )}
    </Card>
  );
}

function RequestDialog({ mode, entityId, members, onClose, onDone }: {
  mode: 'secondary' | 'primary'; entityId: string; members: Member[]; onClose: () => void; onDone: () => void;
}) {
  const [type, setType] = useState<AccessRequestType>(mode === 'primary' ? 'PRIMARY_USER_CHANGE' : 'ADD_USER');
  const [target, setTarget] = useState('none');
  const [roleId, setRoleId] = useState('none');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [effective, setEffective] = useState('');
  const [reason, setReason] = useState('');
  const [letter, setLetter] = useState<File | null>(null);
  const [extra, setExtra] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: roles = [] } = useQuery({
    queryKey: ['entity-membership-roles-secondary'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('entity_membership_roles').select('id,label,is_primary_representative,sort_order').eq('is_active', true).order('sort_order');
      return (data ?? []).filter((r: any) => !r.is_primary_representative);
    },
  });

  const secondaries = members.filter((m) => !m.is_primary && m.status === 'APPROVED');
  const needsPerson = type === 'ADD_USER' || type === 'PRIMARY_USER_CHANGE';
  const needsTarget = type === 'CHANGE_ROLE' || type === 'REMOVE_USER';
  const needsRole = type === 'ADD_USER' || type === 'CHANGE_ROLE';

  const submit = async () => {
    if (!letter) return toast.error('Please attach the signed authorisation letter');
    if (!reason.trim()) return toast.error('Please give a reason');
    if (needsTarget && target === 'none') return toast.error('Select the user');
    if (needsRole && roleId === 'none') return toast.error('Select a role');
    if (needsPerson && (!fullName.trim() || !email.trim())) return toast.error('Name and email are required');
    setBusy(true);
    try {
      const letterPath = await uploadAccessFile(entityId, letter);
      const supportingPaths = await Promise.all(extra.map((f) => uploadAccessFile(entityId, f)));
      await submitAccessRequest({
        entityId, type, reason, letterPath, supportingPaths,
        targetMembershipId: needsTarget ? target : null, roleId: needsRole ? roleId : null,
        fullName: needsPerson ? fullName : undefined, email: needsPerson ? email : undefined,
        phone: needsPerson ? phone : undefined, position: needsPerson ? position : undefined, effectiveDate: effective,
      });
      toast.success('Request submitted to the regulator');
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'primary' ? 'Change Primary User' : 'Request user change'}</DialogTitle>
          <DialogDescription>
            {mode === 'primary'
              ? 'The regulator reviews this request and a second officer approves it before the Primary User role moves. Attach a board resolution or letter signed by an authorised signatory.'
              : 'Attach an authorisation letter signed by an authorised signatory. The regulator reviews and approves the change.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {mode === 'secondary' && (
            <div><Label>Request type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AccessRequestType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADD_USER">Add a new user</SelectItem>
                  <SelectItem value="CHANGE_ROLE">Change a user's role</SelectItem>
                  <SelectItem value="REMOVE_USER">Remove a user</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {needsTarget && (
            <div><Label>User</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>Select user</SelectItem>
                  {secondaries.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email} · {m.role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {needsPerson && (
            <>
              {mode === 'primary' && <p className="text-sm font-medium">New Primary User</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                <div><Label>Position / title</Label><Input value={position} onChange={(e) => setPosition(e.target.value)} /></div>
              </div>
            </>
          )}
          {needsRole && (
            <div><Label>Role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>Select role</SelectItem>
                  {roles.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Requested effective date (optional)</Label><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></div>
          <div><Label>Reason</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div><Label>{mode === 'primary' ? 'Board resolution / authorisation letter' : 'Authorisation letter'} (required, max 20 MB)</Label>
            <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(e) => setLetter(e.target.files?.[0] ?? null)} /></div>
          <div><Label>Supporting documents (optional{mode === 'primary' ? ', e.g. ID of new Primary User' : ''})</Label>
            <Input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(e) => setExtra(Array.from(e.target.files ?? []))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
