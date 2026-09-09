/**
 * Supervisory Policy Profile register.
 *
 * One generic administration surface for every supervisory domain's policy
 * profiles — MIPL reference profiles, regulator-adopted and regulator-authored
 * profiles live in the same register, distinguished by origin, never by a
 * hardcoded domain list. All searching, filtering, sorting and paging is
 * server-side through `supervisory_policy_profile_register`.
 */
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { useListingState } from '@/components/shared/listing';
import { RegulatorScopeFilter } from '@/components/supervision/RegulatorScopeFilter';
import { useServerPageGuard } from '@/components/shared/listing/useServerPageGuard';
import {
  useSupervisoryPolicyProfileOptions,
  useSupervisoryPolicyProfiles,
  type PolicyProfileRow,
} from '@/hooks/useSupervisoryPolicyProfiles';
import {
  EmptyPanel, ErrorPanel, ProfileOriginBadge, ProfileStatusBadge, formatDate, humanize,
} from '@/components/admin/supervisory-policy-profile/labels';

const FILTER_KEYS = ['domain', 'origin', 'status', 'regulator'];
const opt = (v: string) => (v === 'all' ? null : v);

export default function SupervisoryPolicyProfileRegisterPage() {
  const navigate = useNavigate();
  const listing = useListingState({
    defaultSort: { key: 'updated_at', direction: 'desc' },
    filterKeys: FILTER_KEYS,
  });
  const options = useSupervisoryPolicyProfileOptions();
  const f = listing.filters;

  const query = useSupervisoryPolicyProfiles({
    search: listing.search,
    domainCode: opt(f.domain),
    origin: opt(f.origin),
    status: opt(f.status),
    regulatorId: opt(f.regulator),
    sortKey: listing.sort?.key ?? 'updated_at',
    sortDirection: listing.sort?.direction ?? 'desc',
    page: listing.page,
    pageSize: listing.pageSize,
  });

  const total = query.data?.total ?? 0;
  const guard = useServerPageGuard({
    page: listing.page, pageSize: listing.pageSize, totalCount: total,
    setPage: listing.setPage, ready: query.isSuccess,
  });

  const o = options.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supervisory Policy Profiles"
        description="The governed configuration each regulator applies in a supervisory domain: the exact policy component versions, their review and approval state, and what is still outstanding."
      />

      <RegisterToolbar
        search={listing.search}
        onSearchChange={listing.setSearch}
        searchPlaceholder="Search code, name or version"
      >
        <Select value={f.domain} onValueChange={(v) => listing.setFilter('domain', v)}>
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Supervisory domain"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All domains</SelectItem>
            {(o?.domains ?? []).map((d) => (
              <SelectItem key={d.domain_code} value={d.domain_code}>{humanize(d.domain_code)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={f.origin} onValueChange={(v) => listing.setFilter('origin', v)}>
          <SelectTrigger className="h-9 w-[12rem]" aria-label="Origin"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All origins</SelectItem>
            {(o?.origins ?? []).map((x) => <SelectItem key={x} value={x}>{humanize(x)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.status} onValueChange={(v) => listing.setFilter('status', v)}>
          <SelectTrigger className="h-9 w-[10rem]" aria-label="Lifecycle status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(o?.statuses ?? []).map((s) => <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <RegulatorScopeFilter options={o} value={f.regulator} onChange={(v) => listing.setFilter('regulator', v)} />
      </RegisterToolbar>

      {query.error ? <ErrorPanel error={query.error} /> : query.isLoading || options.isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : total === 0 && !guard.repairing ? (
        <EmptyPanel
          title="No policy profile matches these filters."
          description="Clear the search or a filter. Visibility follows your supervisory scope."
        />
      ) : (
        <SupervisoryRegister<PolicyProfileRow>
          rows={query.data?.rows ?? []}
          getRowId={(r) => r.id}
          identifierHeader="Policy profile"
          identifier={(r) => ({ reference: r.code, subject: r.name ?? undefined, copyValue: r.id, copyLabel: 'Copy policy profile id' })}
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
          onRowClick={(r) => navigate(`/admin/supervisory-policy-profiles/${r.id}`)}
          columns={[
            { id: 'domain_code', header: 'Domain', sortable: true, sortKey: 'domain_code', cell: (r) => <span className="text-sm">{humanize(r.domain_code)}</span> },
            { id: 'profile_version', header: 'Version', sortable: true, sortKey: 'profile_version', cell: (r) => <span className="font-mono text-xs">{r.profile_version}</span> },
            { id: 'origin', header: 'Origin', sortable: true, sortKey: 'origin', cell: (r) => <ProfileOriginBadge origin={r.origin} label={r.origin_label} /> },
            { id: 'regulator', header: 'Regulator', cell: (r) => (
              <span className="text-sm">{r.regulator_name ?? (
                <span className="text-muted-foreground">
                  {r.origin === 'MIPL_REFERENCE' ? 'MIPL Reference — not regulator-owned' : 'Not regulator-owned'}
                </span>
              )}</span>) },
            { id: 'status', header: 'Status', sortable: true, sortKey: 'status', cell: (r) => <ProfileStatusBadge status={r.status} /> },
            { id: 'components', header: 'Components bound', align: 'right', cell: (r) => (
              <span className="font-mono text-xs">{r.bound_components} / {r.required_components}</span>) },
            { id: 'effective', header: 'Effective period', priority: 2, cell: (r) => (
              <span className="font-mono text-xs">{r.effective_from ? formatDate(r.effective_from) : '—'} → {r.effective_to ? formatDate(r.effective_to) : 'open'}</span>) },
            { id: 'updated_at', header: 'Updated', priority: 3, sortable: true, sortKey: 'updated_at', cell: (r) => (
              <span className="font-mono text-xs">{formatDate(r.updated_at)}</span>) },
          ]}
          actions={(r) => (
            <Button variant="ghost" size="sm" data-rbac="aml_supervision.manage_config"
              onClick={(e) => { e.stopPropagation(); navigate(`/admin/supervisory-policy-profiles/${r.id}`); }}>
              Review
            </Button>
          )}
        />
      )}
    </div>
  );
}
