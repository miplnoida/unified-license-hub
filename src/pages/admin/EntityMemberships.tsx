/**
 * RDM-ENTITY-001 Wave A — Entity membership review (`/admin/entity-memberships`).
 *
 * Membership is the only route by which an external user gains access to a
 * regulated entity's data. Every transition (verify -> approve -> revoke) is a
 * governed RPC; the UI never writes `entity_user_memberships` directly.
 */
import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, UserCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { useMemberships, useMembershipRoles, useMembershipMutations, type MembershipRow } from '@/hooks/useEntityRegistry';
import { useUserDisplayNames } from '@/hooks/useUserDisplayNames';
import { useCan } from '@/hooks/useCan';
import { formatDateTime } from '@/lib/datetime';

const STATUS_TABS = ['PENDING_VERIFICATION', 'REQUESTED', 'VERIFIED', 'APPROVED', 'REJECTED', 'REVOKED', 'all'];

const STATUS_TONE = (s: string) => {
  switch (s) {
    case 'APPROVED': return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
    case 'REJECTED':
    case 'REVOKED': return 'bg-destructive/10 text-destructive border-destructive/30';
    case 'VERIFIED': return 'bg-blue-500/10 text-blue-700 border-blue-200';
    default: return 'bg-amber-500/10 text-amber-700 border-amber-200';
  }
};

async function askReason(title: string) {
  const res = await Swal.fire({
    title,
    input: 'textarea',
    inputPlaceholder: 'Reason (required, min 10 characters)',
    showCancelButton: true,
    confirmButtonText: 'Confirm',
    inputValidator: (v) => (!v || v.trim().length < 10 ? 'Please provide at least 10 characters.' : undefined),
  });
  return res.isConfirmed ? String(res.value).trim() : null;
}

export default function EntityMemberships() {
  const [status, setStatus] = useState('REQUESTED');
  const { data = [], isLoading, error } = useMemberships({ status });
  const { data: roles = [] } = useMembershipRoles();
  const { verify, approve, reject, revoke } = useMembershipMutations();

  const canVerify = useCan('entity_membership', 'verify');
  const canApprove = useCan('entity_membership', 'approve');
  const canRevoke = useCan('entity_membership', 'revoke');

  const rows = data as MembershipRow[];
  const { data: names = {} } = useUserDisplayNames(rows.map((r) => r.user_id));
  const roleLabel = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.id, r.label])),
    [roles],
  );

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); }
    catch (e) { toast.error((e as Error).message || 'Action failed.'); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Entity Memberships"
          description="Approve who may act for a regulated entity. Approved membership is what grants portal access to that entity's data."
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Membership requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Tabs value={status} onValueChange={setStatus}>
              <TabsList className="flex-wrap h-auto">
                {STATUS_TABS.map((s) => (
                  <TabsTrigger key={s} value={s}>{s === 'all' ? 'All' : s.replace(/_/g, ' ').toLowerCase()}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Membership role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Authority evidence</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center">
                      <Loader2 className="h-5 w-5 animate-spin inline" />
                    </TableCell></TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No membership records in this view.
                    </TableCell></TableRow>
                  )}
                  {rows.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{names[m.user_id] || m.user_id.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">{m.entity_id.slice(0, 8)}</TableCell>
                      <TableCell>{roleLabel[m.membership_role_id] || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className={STATUS_TONE(m.status)}>{m.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.authority_evidence_reference || 'Not supplied'}
                      </TableCell>
                      <TableCell className="text-xs">{formatDateTime(m.requested_at)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        {canVerify && ['REQUESTED', 'PENDING_VERIFICATION'].includes(m.status) && (
                          <Button size="sm" variant="outline" disabled={verify.isPending}
                            onClick={() => act(() => verify.mutateAsync({ id: m.id }), 'Evidence verified.')}>
                            Verify
                          </Button>
                        )}
                        {canApprove && ['VERIFIED', 'REQUESTED'].includes(m.status) && (
                          <Button size="sm" className="gap-1" disabled={approve.isPending}
                            onClick={() => act(() => approve.mutateAsync(m.id), 'Membership approved.')}>
                            <UserCheck className="h-4 w-4" /> Approve
                          </Button>
                        )}
                        {canApprove && !['APPROVED', 'REJECTED', 'REVOKED'].includes(m.status) && (
                          <Button size="sm" variant="outline" disabled={reject.isPending}
                            onClick={async () => {
                              const reason = await askReason('Reject membership request');
                              if (reason) act(() => reject.mutateAsync({ id: m.id, reason }), 'Membership rejected.');
                            }}>
                            Reject
                          </Button>
                        )}
                        {canRevoke && m.status === 'APPROVED' && (
                          <Button size="sm" variant="destructive" disabled={revoke.isPending}
                            onClick={async () => {
                              const reason = await askReason('Revoke membership');
                              if (reason) act(() => revoke.mutateAsync({ id: m.id, reason }), 'Membership revoked.');
                            }}>
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
