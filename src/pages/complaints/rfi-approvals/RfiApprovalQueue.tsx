import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldCheck, Eye } from 'lucide-react';
import { formatDateTime, formatDateOnly } from '@/lib/datetime';
import { toast } from 'sonner';
import {
  useComplaintRfiQueue,
  useComplaintRfiSettings,
  useSetComplaintRfiApprovalRequired,
  type ComplaintRfi,
} from '@/hooks/useComplaintRfis';
import { useCan } from '@/hooks/useCan';
import { useAuth } from '@/contexts/AuthContext';
import { ReviewRfiDialog } from '@/components/complaints/ReviewRfiDialog';

const STATE_VARIANT: Record<string, any> = {
  draft: 'outline',
  pending_approval: 'secondary',
  rejected: 'destructive',
  dispatched: 'default',
};

/**
 * Supervisory approval queue for outbound complaint information requests.
 * Drafts stay internal until an approver dispatches them to the entity.
 */
export default function RfiApprovalQueue() {
  const { data: rfis = [], isLoading, refetch } = useComplaintRfiQueue();
  const { data: settings } = useComplaintRfiSettings();
  const setRequired = useSetComplaintRfiApprovalRequired();
  const canApprove = useCan('complaint_management', 'approve_rfi');
  const canConfigure = useCan('complaint_management', 'edit');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [active, setActive] = useState<ComplaintRfi | null>(null);

  const focusId = params.get('rfi');

  const groups = useMemo(() => {
    const pending = rfis.filter((r) => r.approval_state === 'pending_approval');
    return {
      pending,
      mine: rfis.filter(
        (r) => (r.approval_state === 'draft' || r.approval_state === 'rejected') && r.raised_by === user?.id,
      ),
      drafts: rfis.filter((r) => r.approval_state === 'draft'),
      rejected: rfis.filter((r) => r.approval_state === 'rejected'),
      dispatched: rfis.filter((r) => r.approval_state === 'dispatched'),
    };
  }, [rfis, user?.id]);

  const openReview = (rfi: ComplaintRfi) => setActive(rfi);

  const closeReview = (open: boolean) => {
    if (!open) {
      setActive(null);
      if (focusId) {
        params.delete('rfi');
        setParams(params, { replace: true });
      }
    }
  };

  const toggle = async (v: boolean) => {
    try {
      await setRequired.mutateAsync(v);
      toast.success(v ? 'Approval gate enabled' : 'Approval gate disabled');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not update the setting');
    }
  };

  const renderTable = (rows: ComplaintRfi[], emptyLabel: string) => {
    if (!rows.length) {
      return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
    }
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Complaint</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={r.id === focusId ? 'bg-muted/50' : undefined}>
                <TableCell className="font-mono text-xs">{r.complaint_number ?? '—'}</TableCell>
                <TableCell className="text-sm">{r.licensee_name ?? '—'}</TableCell>
                <TableCell className="text-sm">{r.items.length}</TableCell>
                <TableCell>
                  <Badge variant={STATE_VARIANT[r.approval_state] ?? 'outline'} className="capitalize">
                    {r.approval_state.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTime(r.submitted_for_approval_at)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateOnly(r.due_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => openReview(r)}>
                    <Eye className="h-4 w-4 mr-1" />Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">RFI approval &amp; oversight</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quality control on outbound information requests. Nothing reaches a regulated entity until it is approved
            and dispatched.
          </p>
        </div>
        {canConfigure && (
          <div className="flex items-center gap-2 rounded-md border px-3 py-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="rfi-gate" className="text-xs">Require approval before dispatch</Label>
            <Switch
              id="rfi-gate"
              data-rbac="complaint_management.edit"
              checked={settings?.approval_required ?? true}
              onCheckedChange={toggle}
              disabled={setRequired.isPending}
            />
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading queue…
            </div>
          ) : (
            <Tabs defaultValue="pending">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="pending">Pending approval ({groups.pending.length})</TabsTrigger>
                <TabsTrigger value="mine">My drafts ({groups.mine.length})</TabsTrigger>
                <TabsTrigger value="rejected">Rejected ({groups.rejected.length})</TabsTrigger>
                <TabsTrigger value="dispatched">Dispatched ({groups.dispatched.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="pending" className="mt-4">
                {renderTable(groups.pending, 'No requests awaiting approval.')}
              </TabsContent>
              <TabsContent value="mine" className="mt-4">
                {renderTable(groups.mine, 'You have no drafts in progress.')}
              </TabsContent>
              <TabsContent value="rejected" className="mt-4">
                {renderTable(groups.rejected, 'No rejected drafts.')}
              </TabsContent>
              <TabsContent value="dispatched" className="mt-4">
                {renderTable(groups.dispatched, 'Nothing dispatched yet.')}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <ReviewRfiDialog
        open={!!active}
        onOpenChange={closeReview}
        rfi={active}
        canApprove={canApprove}
        onDone={() => refetch()}
      />
    </div>
  );
}
