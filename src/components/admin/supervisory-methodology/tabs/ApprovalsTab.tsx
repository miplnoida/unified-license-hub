/**
 * Regulator approval register.
 *
 * Server-paged and regulator-scoped by RLS: an officer scoped to one regulator
 * cannot render another regulator's decision, and the browser never widens the
 * query to compensate. Recorded decisions are immutable.
 */
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { useListingState } from '@/components/shared/listing';
import { useServerPageGuard } from '@/components/shared/listing/useServerPageGuard';
import { useSupervisoryMethodologyApprovals, type MethodologyApprovalRow } from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, formatDateTime, humanize } from '../labels';

export function ApprovalsTab({ methodologyId }: { methodologyId: string }) {
  const listing = useListingState({
    prefix: 'a',
    defaultSort: { key: 'decided_at', direction: 'desc' },
    filterKeys: ['decision', 'current'],
  });
  const f = listing.filters;

  const query = useSupervisoryMethodologyApprovals({
    methodologyId,
    decision: f.decision === 'all' ? null : f.decision,
    currentOnly: f.current === 'yes' ? true : null,
    sortKey: listing.sort?.key ?? 'decided_at',
    sortDirection: listing.sort?.direction ?? 'desc',
    page: listing.page,
    pageSize: listing.pageSize,
  });

  const total = query.data?.total_count ?? 0;
  const guard = useServerPageGuard({
    page: listing.page, pageSize: listing.pageSize, totalCount: total,
    setPage: listing.setPage, ready: query.isSuccess,
  });

  return (
    <div className="space-y-3">
      <RegisterToolbar>
        <Select value={f.decision} onValueChange={(v) => listing.setFilter('decision', v)}>
          <SelectTrigger className="h-9 w-[12rem]" aria-label="Decision"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All decisions</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REVOKED">Revoked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={f.current} onValueChange={(v) => listing.setFilter('current', v)}>
          <SelectTrigger className="h-9 w-[12rem]" aria-label="Current decision"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All decisions recorded</SelectItem>
            <SelectItem value="yes">Current decision only</SelectItem>
          </SelectContent>
        </Select>
      </RegisterToolbar>

      {query.error ? <ErrorPanel error={query.error} /> : query.isLoading ? <Skeleton className="h-56 w-full" /> :
        total === 0 && !guard.repairing ? (
          <EmptyPanel
            title="No regulator approval decision is recorded for this version."
            description="A regulator decision appears here once an authorised approver records it."
          />
        ) : (
          <SupervisoryRegister<MethodologyApprovalRow>
            rows={query.data?.rows ?? []}
            getRowId={(r) => r.id}
            identifierHeader="Methodology"
            identifier={(r) => ({ reference: `${r.methodology_code} v${r.methodology_version}`, subject: r.methodology_name ?? undefined })}
            identifierSortable
            identifierSortKey="methodology"
            mode="server"
            sort={listing.sort}
            onSortToggle={listing.toggleSort}
            paged
            page={guard.validPage}
            pageSize={listing.pageSize}
            totalCount={total}
            onPageChange={listing.setPage}
            onPageSizeChange={listing.setPageSize}
            showRecordCount
            columns={[
              { id: 'regulator', header: 'Regulator', sortable: true, sortKey: 'regulator', cell: (r) => <span className="text-sm">{r.regulator_name ?? '—'}</span> },
              { id: 'decision', header: 'Decision', sortable: true, sortKey: 'decision', cell: (r) => (
                <Badge variant="outline" className={r.decision === 'APPROVED'
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-destructive/30 bg-destructive/10 text-destructive'}>{humanize(r.decision)}</Badge>) },
              { id: 'submitted_by', header: 'Submitted by', priority: 2, sortable: true, sortKey: 'submitted_by', cell: (r) => <span className="text-xs">{r.submitted_by_name ?? '—'}</span> },
              { id: 'decided_by', header: 'Decided by', sortable: true, sortKey: 'decided_by', cell: (r) => <span className="text-xs">{r.decided_by_name ?? '—'}</span> },
              { id: 'decided_at', header: 'Decision date', sortable: true, sortKey: 'decided_at', cell: (r) => <span className="font-mono text-xs">{formatDateTime(r.decided_at)}</span> },
              { id: 'current', header: 'Current', sortable: true, sortKey: 'current', cell: (r) => (r.is_current ? 'Yes' : 'No') },
              { id: 'rationale', header: 'Rationale', priority: 3, cell: (r) => <span className="text-xs text-muted-foreground">{r.rationale ?? '—'}</span> },
            ]}
            actions={() => null}
          />
        )}
    </div>
  );
}
