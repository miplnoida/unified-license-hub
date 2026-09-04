/**
 * Supervisory Methodology register.
 *
 * A generic administration surface for every supervisory domain's methodology
 * versions — MIPL reference templates, regulator-adopted versions and
 * regulator-authored versions live in one register, distinguished by origin and
 * never by a hardcoded list. All filtering, sorting and paging is server-side
 * through `supervisory_methodology_register`; the filter vocabulary comes from
 * `supervisory_methodology_register_options`.
 */
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { useListingState } from '@/components/shared/listing';
import { useServerPageGuard } from '@/components/shared/listing/useServerPageGuard';
import {
  useSupervisoryMethodologies,
  useSupervisoryMethodologyRegisterOptions,
  type MethodologyRegisterRow,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import {
  ApprovalStateBadge, EmptyPanel, ErrorPanel, OriginBadge, StatusBadge, formatDate, humanize,
} from '@/components/admin/supervisory-methodology/labels';

const FILTER_KEYS = ['domain', 'origin', 'status', 'regulator', 'sector', 'approval'];
const opt = (v: string) => (v === 'all' ? null : v);

export default function SupervisoryMethodologyRegisterPage() {
  const navigate = useNavigate();
  const listing = useListingState({
    defaultSort: { key: 'domain', direction: 'asc' },
    filterKeys: FILTER_KEYS,
  });
  const options = useSupervisoryMethodologyRegisterOptions();
  const f = listing.filters;

  const query = useSupervisoryMethodologies({
    search: listing.search,
    domainCode: opt(f.domain),
    origin: opt(f.origin),
    status: opt(f.status),
    regulatorId: opt(f.regulator),
    sectorId: opt(f.sector),
    approvalState: opt(f.approval),
    sortKey: listing.sort?.key ?? 'domain',
    sortDirection: listing.sort?.direction ?? 'asc',
    page: listing.page,
    pageSize: listing.pageSize,
  });

  const total = query.data?.total_count ?? 0;
  const guard = useServerPageGuard({
    page: listing.page, pageSize: listing.pageSize, totalCount: total,
    setPage: listing.setPage, ready: query.isSuccess,
  });

  const o = options.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supervisory Methodology"
        description="Review supervisory assessment methodologies, their versions and their governance state. Content and calculation policy are approved separately."
      />

      <RegisterToolbar
        search={listing.search}
        onSearchChange={listing.setSearch}
        searchPlaceholder="Search code, name, version or regulator"
      >
        <Select value={f.domain} onValueChange={(v) => listing.setFilter('domain', v)}>
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Supervisory domain"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All domains</SelectItem>
            {(o?.domains ?? []).map((d) => <SelectItem key={d} value={d}>{humanize(d)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.origin} onValueChange={(v) => listing.setFilter('origin', v)}>
          <SelectTrigger className="h-9 w-[12rem]" aria-label="Origin"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All origins</SelectItem>
            {(o?.origins ?? []).map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.status} onValueChange={(v) => listing.setFilter('status', v)}>
          <SelectTrigger className="h-9 w-[10rem]" aria-label="Lifecycle status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(o?.statuses ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.regulator} onValueChange={(v) => listing.setFilter('regulator', v)}>
          <SelectTrigger className="h-9 w-[13rem]" aria-label="Regulator"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All regulators</SelectItem>
            {(o?.regulators ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.sector} onValueChange={(v) => listing.setFilter('sector', v)}>
          <SelectTrigger className="h-9 w-[13rem]" aria-label="Sector"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            {(o?.sectors ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.approval} onValueChange={(v) => listing.setFilter('approval', v)}>
          <SelectTrigger className="h-9 w-[15rem]" aria-label="Regulator approval state"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any regulator approval state</SelectItem>
            {(o?.approval_states ?? []).map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'APPROVED' ? 'Regulator approved' : s === 'REVOKED' ? 'Approval revoked' : 'No approval recorded'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </RegisterToolbar>

      {query.error ? <ErrorPanel error={query.error} /> : query.isLoading || options.isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : total === 0 && !guard.repairing ? (
        <EmptyPanel
          title="No methodology matches these filters."
          description="Clear the search or a filter. Methodology visibility follows your regulator scope."
        />
      ) : (
        <SupervisoryRegister<MethodologyRegisterRow>
          rows={query.data?.rows ?? []}
          getRowId={(r) => r.id}
          identifierHeader="Methodology"
          identifier={(r) => ({ reference: r.code, subject: r.name ?? undefined, copyValue: r.id, copyLabel: 'Copy methodology id' })}
          identifierSortable
          identifierSortKey="code"
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
          onRowClick={(r) => navigate(`/admin/supervisory-methodology/${r.id}`)}
          columns={[
            { id: 'domain', header: 'Domain', sortable: true, sortKey: 'domain', cell: (r) => <span className="text-sm">{humanize(r.domain_code)}</span> },
            { id: 'version', header: 'Version', sortable: true, sortKey: 'version', cell: (r) => <span className="font-mono text-xs">{r.version}</span> },
            { id: 'origin', header: 'Origin', sortable: true, sortKey: 'origin', cell: (r) => <OriginBadge origin={r.origin} label={r.origin_label} /> },
            { id: 'regulator', header: 'Regulator', sortable: true, sortKey: 'regulator', cell: (r) => (
              <span className="text-sm">{r.regulator_name ?? <span className="text-muted-foreground">Not regulator-owned</span>}</span>) },
            { id: 'applicability', header: 'Applicability', priority: 3, cell: (r) => (
              <span className="text-xs">{r.sector_summary ?? <span className="text-muted-foreground">All sectors</span>}</span>) },
            { id: 'status', header: 'Status', sortable: true, sortKey: 'status', cell: (r) => <StatusBadge status={r.status} /> },
            { id: 'questions', header: 'Questions', align: 'right', sortable: true, sortKey: 'questions', cell: (r) => (
              <span className="font-mono text-xs">{r.question_count}</span>) },
            { id: 'effective', header: 'Effective period', priority: 2, sortable: true, sortKey: 'effective_from', cell: (r) => (
              <span className="font-mono text-xs">{formatDate(r.effective_from)} → {r.effective_to ? formatDate(r.effective_to) : 'open'}</span>) },
            { id: 'approval', header: 'Regulator approval', priority: 2, sortable: true, sortKey: 'approval', cell: (r) => <ApprovalStateBadge state={r.approval_state} /> },
            { id: 'updated', header: 'Updated', priority: 3, sortable: true, sortKey: 'updated', cell: (r) => (
              <span className="font-mono text-xs">{formatDate(r.updated_at)}</span>) },
          ]}
          actions={(r) => (
            <Button variant="ghost" size="sm" data-rbac="aml_supervision.view" onClick={(e) => { e.stopPropagation(); navigate(`/admin/supervisory-methodology/${r.id}`); }}>
              Review
            </Button>
          )}
        />
      )}
    </div>
  );
}
