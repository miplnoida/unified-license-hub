/**
 * F8A-B3 — person identity resolution queue (`/persons/identity-queue`).
 *
 * Lists Fit & Proper records whose canonical person is not yet established, using
 * `fp_person_identity_queue`. Resolution is only ever performed by the governed
 * `fp_link_person_manual` RPC, which requires permission, records a written
 * reason and writes its own audit entry. This screen contains no matching or
 * scoring logic and never writes to a table directly.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { ScreenHelpLink } from '@/components/help/ScreenHelpLink';
import {
  usePersonIdentityQueue, useLinkPersonManually, type IdentityQueueRow,
} from '@/hooks/usePerson360';

const UNRESOLVED: IdentityQueueRow['state'][] = [
  'CONFLICT_DETECTED', 'DETERMINISTIC_MATCH_AVAILABLE', 'AMBIGUOUS_CANDIDATES', 'NO_CANDIDATE',
];

function stateBadge(state: IdentityQueueRow['state']) {
  switch (state) {
    case 'LINKED_DETERMINISTIC':
    case 'MANUALLY_LINKED':
      return <Badge variant="default">Resolved</Badge>;
    case 'CONFLICT_DETECTED':
      return <Badge variant="destructive">Conflict</Badge>;
    case 'AMBIGUOUS_CANDIDATES':
      return <Badge variant="secondary">Ambiguous</Badge>;
    case 'DETERMINISTIC_MATCH_AVAILABLE':
      return <Badge variant="outline">Match available</Badge>;
    default:
      return <Badge variant="outline">No candidate</Badge>;
  }
}

export default function PersonIdentityQueue() {
  const { data, isLoading, error } = usePersonIdentityQueue();
  const link = useLinkPersonManually();
  const [onlyUnresolved, setOnlyUnresolved] = useState(true);
  const [target, setTarget] = useState<IdentityQueueRow | null>(null);
  const [partyId, setPartyId] = useState('');
  const [reason, setReason] = useState('');

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return onlyUnresolved ? all.filter((r) => UNRESOLVED.includes(r.state)) : all;
  }, [data, onlyUnresolved]);

  const submit = async () => {
    if (!target) return;
    try {
      await link.mutateAsync({
        fpIndividualId: target.fp_individual_id,
        personPartyId: partyId.trim(),
        reason: reason.trim(),
      });
      toast.success('Canonical person linked');
      setTarget(null);
      setPartyId('');
      setReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Linkage rejected');
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Identity Resolution Queue"
        description="Fit & Proper records whose canonical person is not yet established"
        actions={<ScreenHelpLink surface="ownership-ubo" />}
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Queue unavailable</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : 'Read denied.'}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>
            {rows.length} record{rows.length === 1 ? '' : 's'}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setOnlyUnresolved((v) => !v)}>
            {onlyUnresolved ? 'Show all records' : 'Show unresolved only'}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing awaiting identity resolution.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fit &amp; Proper record</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Candidates</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.fp_individual_id}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell>{r.status ?? '—'}</TableCell>
                    <TableCell>{r.candidate_count}</TableCell>
                    <TableCell>{stateBadge(r.state)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.reason ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {r.person_party_id ? (
                        <Link className="text-sm text-primary underline" to={`/persons/${r.person_party_id}`}>
                          Open person
                        </Link>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setTarget(r)}>
                          Resolve
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm canonical person</DialogTitle>
            <DialogDescription>
              Linking {target?.full_name} to a canonical person is audited and requires a written
              reason. The server rejects the link if it contradicts recorded appointments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="person-party-id">Canonical person party ID</Label>
              <Input
                id="person-party-id"
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="link-reason">Reason</Label>
              <Textarea
                id="link-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Evidence relied upon for this identity determination"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <GuardedButton
              module="licensee_management"
              action="edit"
              data-rbac="licensee_management.edit"
              onClick={submit}
              disabled={link.isPending || !partyId.trim() || reason.trim().length < 5}
            >
              {link.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm link
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
