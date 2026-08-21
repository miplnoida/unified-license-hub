import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { useActiveSector } from '@/contexts/ActiveSectorContext';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { LICENSE_STATUS_LABELS, LicenseStatus, INTERNAL_ROLES } from '@/types/platform';
import { Search, Eye, Loader2, X, FileDown } from 'lucide-react';
import { resolveLicenseStatus } from '@/lib/licenseStatusBadge';
import { describeLicensesFilter } from '@/lib/licenseeDashboardDrilldowns';
import { downloadLicenseCertificate } from '@/lib/licenseCertificate';
import { useLicenseRegister } from '@/hooks/useLicenseLifecycle';
import { formatDateTime } from '@/lib/datetime';

interface License {
  id: string;
  license_number: string;
  license_type: string;
  holder_id: string;
  status: LicenseStatus;
  issued_at: string;
  valid_from: string;
  valid_until: string | null;
  conditions: string | null;
  created_at: string;
  application_id?: string | null;
  sector_id?: string | null;
  resolved_sector_id?: string | null;
  total_count?: number;
  entity_name?: string | null;
}

const statusVariant: Record<string, 'approved' | 'warning' | 'destructive' | 'outline'> = {
  active: 'approved',
  expired: 'destructive',
  suspended: 'destructive',
  revoked: 'destructive',
  cancelled: 'destructive',
  expiring: 'warning',
};

export default function LicensesList() {
  const { user } = useAuth();
  const { resolvedLicenseeId, isPpoc, actingAs } = usePpoc();
  const { activeSectorId, availableSectors } = useActiveSector();
  const portalContext = useEffectivePortalContext();
  const navigate = useNavigate();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get('status');
  const urlFilter = searchParams.get('filter'); // 'expiring' | 'expired'
  const dashboardChip = describeLicensesFilter(searchParams);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(urlStatus && urlStatus !== 'all' ? urlStatus : (urlFilter === 'expired' ? 'expired' : 'all'));
  const isGlobalInternalView = !!user
    && !portalContext.loading
    && (portalContext.isInternal || INTERNAL_ROLES.includes(user.role))
    && !(isPpoc && actingAs === 'ppoc' && resolvedLicenseeId);
  const validActiveSectorId = activeSectorId && availableSectors.some((sector) => sector.id === activeSectorId)
    ? activeSectorId
    : null;

  // P04 — the internal licence register is a server read model: status, SLA
  // state, open conditions and next action are all server-owned.
  const [registerPage, setRegisterPage] = useState(0);
  const registerPageSize = 25;
  const registerSlaFilter = urlFilter === 'expiring' ? 'due_soon' : urlFilter === 'expired' ? 'breached' : null;
  const register = useLicenseRegister({
    search,
    status: statusFilter,
    sectorId: validActiveSectorId,
    slaState: registerSlaFilter,
    page: registerPage,
    pageSize: registerPageSize,
  });
  const registerRows = isGlobalInternalView ? register.data?.rows ?? [] : [];
  const registerTotal = register.data?.total ?? 0;
  const registerLastPage = Math.max(0, Math.ceil(registerTotal / registerPageSize) - 1);

  useEffect(() => {
    if (urlStatus && urlStatus !== 'all') setStatusFilter(urlStatus);
    else if (urlFilter === 'expired') setStatusFilter('expired');
    else if (urlFilter === 'expiring') setStatusFilter('active');
  }, [urlStatus, urlFilter]);

  const clearDashboardFilter = () => {
    setSearchParams({});
    setStatusFilter('all');
  };

  useEffect(() => {
    async function load() {
      if (isGlobalInternalView) { setLoading(false); return; }
      setLoading(true);
      const rpcParams = {
        _page: 0,
        _page_size: 500,
        _search: search || null,
        _status: statusFilter === 'all' ? null : statusFilter,
        _sort_by: 'created_at',
        _sort_dir: 'desc',
        _licensee_id: isGlobalInternalView ? null : resolvedLicenseeId,
        _sector_id: validActiveSectorId,
      };
      const { data, error } = await supabase.rpc('get_my_licenses_page' as any, {
        ...rpcParams,
      });

      if (import.meta.env.DEV) {
        console.log('licensee context', {
          userId: user?.id,
          role: user?.role,
          profileLicenseeId: user?.licenseeId ?? null,
          resolvedLicenseeId,
          activeSectorId: validActiveSectorId,
        });
      }

      if (error) {
        setLicenses([]);
        setLoading(false);
        return;
      }

      const rows = ((data || []) as any[]).map((row: any) => ({
        ...row,
        total_count: row.total_count ? Number(row.total_count) : 0,
      }));

      // Enrich with entity name from the linked licensee record.
      const licIds = Array.from(new Set(rows.map((r: any) => r.id).filter(Boolean)));
      if (licIds.length > 0) {
        const { data: licensees } = await supabase
          .from('licensees' as any)
          .select('license_id, name')
          .in('license_id', licIds);
        const nameByLicenseId: Record<string, string> = {};
        ((licensees || []) as any[]).forEach((l: any) => {
          if (l?.license_id && l?.name) nameByLicenseId[l.license_id] = l.name;
        });

        // Safety net: if licensee.name equals the license_type fallback,
        // resolve a better name from the holder's profile / pre_license_users / registration.
        const needsHolderLookup = rows.filter((r: any) =>
          r.holder_id && (!nameByLicenseId[r.id] || nameByLicenseId[r.id] === r.license_type)
        );
        const holderIds = Array.from(new Set(needsHolderLookup.map((r: any) => r.holder_id))) as string[];
        const holderNameById: Record<string, string> = {};
        if (holderIds.length > 0) {
          const [profRes, pluRes, regRes] = await Promise.all([
            supabase.from('profiles').select('id, entity_name, full_name').in('id', holderIds),
            supabase.from('pre_license_users' as any).select('id, entity_name, full_name').in('id', holderIds),
            supabase.from('registrations').select('user_id, applicant_name').in('user_id', holderIds),
          ]);
          ((profRes.data || []) as any[]).forEach((p: any) => {
            const n = p.entity_name || p.full_name;
            if (n && !holderNameById[p.id]) holderNameById[p.id] = n;
          });
          ((pluRes.data || []) as any[]).forEach((p: any) => {
            const n = p.entity_name || p.full_name;
            if (n && !holderNameById[p.id]) holderNameById[p.id] = n;
          });
          ((regRes.data || []) as any[]).forEach((r: any) => {
            if (r.applicant_name && !holderNameById[r.user_id]) holderNameById[r.user_id] = r.applicant_name;
          });
        }

        rows.forEach((r: any) => {
          const fromLicensee = nameByLicenseId[r.id];
          const looksLikeFallback = !fromLicensee || fromLicensee === r.license_type;
          r.entity_name = looksLikeFallback
            ? (holderNameById[r.holder_id] || fromLicensee || null)
            : fromLicensee;
        });
      }

      setLicenses(rows);
      if (import.meta.env.DEV && ((data || []) as any[]).length === 0) {
        console.log('licenses empty state debug', {
          userId: user?.id,
          role: user?.role,
          profileLicenseeId: user?.licenseeId ?? null,
          resolvedLicenseeId,
          activeSectorId: validActiveSectorId,
          rpcParams,
          returnedCount: 0,
        });
      }
      setLoading(false);
    }
    load();
  }, [isGlobalInternalView, resolvedLicenseeId, validActiveSectorId, search, statusFilter, user?.id, user?.role, user?.licenseeId]);

  const filtered = useMemo(() => {
    if (urlFilter !== 'expiring') return licenses;
    const daysParam = Number(searchParams.get('days'));
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30;
    const cutoff = Date.now() + days * 86400000;
    return licenses.filter(l => {
      if (l.status !== 'active') return false;
      if (!l.valid_until) return false;
      const t = new Date(l.valid_until).getTime();
      return t >= Date.now() && t <= cutoff;
    });
  }, [licenses, urlFilter, searchParams]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={isGlobalInternalView ? 'License Management' : 'My Licenses'}
          description={isGlobalInternalView ? 'Manage all issued licenses' : 'View all your licenses and their current status'}
        />

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search licenses..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(LICENSE_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {dashboardChip && (
          <div className="flex items-center gap-2 -mt-2">
            <Badge variant="outline" className="text-xs">Filter: {dashboardChip}</Badge>
            <Button variant="ghost" size="sm" onClick={clearDashboardFilter} className="h-7 px-2 text-xs">
              <X className="h-3 w-3 mr-1" />Clear filter
            </Button>
          </div>
        )}

        {isGlobalInternalView ? (
          <>
            <Card>
              <CardContent className="p-0">
                {register.isLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : register.isError ? (
                  <div className="p-6 text-sm text-destructive">{(register.error as { message?: string })?.message ?? 'Failed to load the licence register'}</div>
                ) : registerRows.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">No licences match this view.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>License #</TableHead>
                          <TableHead>Entity Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Valid Until</TableHead>
                          <TableHead>Lifecycle</TableHead>
                          <TableHead>Conditions</TableHead>
                          <TableHead>Next action</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {registerRows.map((row) => (
                          <TableRow key={row.license_id}>
                            <TableCell className="font-mono font-medium text-sm">{row.license_number}</TableCell>
                            <TableCell className="text-sm">{row.entity_name || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-sm">{row.license_type || '—'}</TableCell>
                            <TableCell><Badge variant={statusVariant[row.status] || 'outline'} className="capitalize">{LICENSE_STATUS_LABELS[row.status as LicenseStatus] || row.status}</Badge></TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.valid_until ? new Date(row.valid_until).toLocaleDateString() : 'No expiry'}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex flex-col gap-1">
                                <Badge variant="outline" className="w-fit text-[10px] capitalize">{row.sla_state.replace('_', ' ')}</Badge>
                                {row.open_matter_kind && (
                                  <span className="text-muted-foreground capitalize">{row.open_matter_kind.replace('_', ' ')} open</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.open_conditions}
                              {row.overdue_conditions > 0 && <span className="text-destructive"> ({row.overdue_conditions} overdue)</span>}
                            </TableCell>
                            <TableCell className="text-sm">{row.next_action ?? '—'}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/licenses/${row.license_id}`)}>
                                <Eye className="h-4 w-4 mr-1" />Open
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            {registerTotal > registerPageSize && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {registerTotal} licences · page {registerPage + 1} of {registerLastPage + 1}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={registerPage === 0} onClick={() => setRegisterPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={registerPage >= registerLastPage} onClick={() => setRegisterPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        ) : (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>License #</TableHead>
                    <TableHead>Entity Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{dashboardChip ? `No licenses matching “${dashboardChip}”.` : (isGlobalInternalView ? 'No licenses found' : 'No licences issued yet')}</TableCell></TableRow>
                  ) : filtered.map(lic => (
                    <TableRow key={lic.id}>
                      <TableCell className="font-mono font-medium text-sm">{lic.license_number}</TableCell>
                      <TableCell className="text-sm">{lic.entity_name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {(() => {
                          const effective = resolveLicenseStatus(lic.status, lic.valid_until);
                          let variant = statusVariant[effective] || 'outline';
                          let label = LICENSE_STATUS_LABELS[effective] || effective;
                          if (effective === 'active' && lic.valid_until) {
                            const days = (new Date(lic.valid_until).getTime() - Date.now()) / 86400000;
                            if (days <= 30) {
                              variant = 'warning';
                              label = 'Expiring Soon';
                            }
                          }
                          return <Badge variant={variant} className="capitalize">{label}</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(lic.issued_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lic.valid_until ? new Date(lic.valid_until).toLocaleDateString() : 'No expiry'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/licenses/${lic.id}`)}>
                            <Eye className="h-4 w-4 mr-1" />View
                          </Button>
                          <Button
                            data-rbac="license_management.view"
                            variant="ghost"
                            size="sm"
                            disabled={downloadingId === lic.id}
                            onClick={async () => {
                              setDownloadingId(lic.id);
                              try {
                                await downloadLicenseCertificate({
                                  licenseId: lic.id,
                                  licenseNumber: lic.license_number,
                                  regenerate: isGlobalInternalView,
                                });
                              } finally {
                                setDownloadingId(null);
                              }
                            }}
                          >
                            {downloadingId === lic.id
                              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              : <FileDown className="h-4 w-4 mr-1" />}
                            Certificate
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
