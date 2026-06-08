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
import { Search, Eye, Loader2, X } from 'lucide-react';
import { describeLicensesFilter } from '@/lib/licenseeDashboardDrilldowns';

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

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default', suspended: 'outline', revoked: 'destructive', expired: 'secondary', cancelled: 'destructive',
};

export default function LicensesList() {
  const { user } = useAuth();
  const { resolvedLicenseeId, isPpoc, actingAs } = usePpoc();
  const { activeSectorId, availableSectors } = useActiveSector();
  const portalContext = useEffectivePortalContext();
  const navigate = useNavigate();
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
        rows.forEach((r: any) => { r.entity_name = nameByLicenseId[r.id] || null; });
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
    const cutoff = Date.now() + 30 * 86400000;
    return licenses.filter(l => {
      if (l.status !== 'active') return false;
      if (!l.valid_until) return false;
      const t = new Date(l.valid_until).getTime();
      return t >= Date.now() && t <= cutoff;
    });
  }, [licenses, urlFilter]);

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
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{dashboardChip ? `No licenses matching “${dashboardChip}”.` : 'No licenses found'}</TableCell></TableRow>
                  ) : filtered.map(lic => (
                    <TableRow key={lic.id}>
                      <TableCell className="font-mono font-medium text-sm">{lic.license_number}</TableCell>
                      <TableCell className="text-sm">{lic.entity_name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[lic.status] || 'outline'} className="capitalize">
                          {LICENSE_STATUS_LABELS[lic.status] || lic.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(lic.issued_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lic.valid_until ? new Date(lic.valid_until).toLocaleDateString() : 'No expiry'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/licenses/${lic.id}`)}>
                          <Eye className="h-4 w-4 mr-1" />View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
