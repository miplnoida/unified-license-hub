import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Search, Loader2, CheckCircle, ChevronLeft, ChevronRight, Briefcase, Layers, Eye } from 'lucide-react';
import { LicenseStatusBadge } from '@/lib/licenseStatusBadge';
import { useLicenseExpiryConfig } from '@/hooks/useLicenseExpiryConfig';

/**
 * CANONICAL LICENCE AUTHORITY
 *
 * `public.entity_licenses` is the ONLY authority for entity-to-licence
 * relationships. `licensees.license_id` is deprecated and MUST NOT be read
 * here: a row in `licensees` is an entity record, not proof of a regulatory
 * licence, and `licensees.status` is not licence status.
 *
 * This screen therefore renders ONE ROW PER CANONICAL LICENCE ATTACHMENT, so
 * an entity holding several licences appears once per licence. Entities with
 * no canonical attachment are shown as "Not licensed" and never carry a
 * licence status badge.
 */
interface LicenseeRow {
  /** Stable row key — entity id plus licence id (multi-licence safe). */
  rowKey: string;
  id: string;
  status: string;
  licensed: boolean;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  license_id: string | null;
  created_at: string;
  // resolved
  licensee_name: string;
  contact_name: string;
  license_number: string;
  license_type: string;
  sector_name: string;
  sub_sector_name: string;
  category_name: string;
  registered_at: string | null;
  application_id: string | null;
  valid_until: string | null;
}


function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((t - today.getTime()) / 86400000);
}


interface LookupMap { [id: string]: string }

const PAGE_SIZE = 10;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

export default function ManageLicensees() {
  const navigate = useNavigate();
  const { data: expiryConfig } = useLicenseExpiryConfig();
  const [rows, setRows] = useState<LicenseeRow[]>([]);
  const [sectors, setSectors] = useState<LookupMap>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'registered_at' | 'licensee_name' | 'sector_name'>('registered_at');
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [licRes, secRes, subRes, catRes, licensesRes, attachRes] = await Promise.all([
        supabase.from('licensees').select('*').order('created_at', { ascending: false }),
        supabase.from('sectors').select('id, name'),
        supabase.from('sub_sectors').select('id, name'),
        supabase.from('categories').select('id, name'),
        supabase.from('licenses').select('id, application_id, license_number, license_type, status, valid_until, holder_id'),
        // CANONICAL authority for entity -> licence relationships.
        supabase.from('entity_licenses').select('id, entity_id, license_id, effective_from, effective_to, is_primary'),
      ]);

      const loadErrors = [licRes.error, secRes.error, subRes.error, catRes.error, licensesRes.error, attachRes.error].filter(Boolean);
      if (loadErrors.length) {
        console.error('[ManageLicensees] Failed to load licensee list', loadErrors);
        setRows([]);
        setLoading(false);
        return;
      }

      const sMap: LookupMap = {};
      (secRes.data || []).forEach(s => { sMap[s.id] = s.name; });
      setSectors(sMap);

      const ssMap: LookupMap = {};
      (subRes.data || []).forEach(s => { ssMap[s.id] = s.name; });

      const cMap: LookupMap = {};
      (catRes.data || []).forEach(c => { cMap[c.id] = c.name; });

      interface LicenceRec {
        id: string; application_id: string | null; license_number: string | null;
        license_type: string | null; status: string | null; valid_until: string | null; holder_id: string | null;
      }
      const licenceById: Record<string, LicenceRec> = {};
      (licensesRes.data || []).forEach((l: any) => { licenceById[l.id] = l as LicenceRec; });

      // Current canonical attachments only, grouped per entity. Multiple
      // licences per entity are fully supported: each becomes its own row.
      const now = Date.now();
      const attachmentsByEntity: Record<string, LicenceRec[]> = {};
      (attachRes.data || []).forEach((a: any) => {
        const licence = licenceById[a.license_id];
        if (!licence) return; // orphan attachment — never presented
        const to = a.effective_to ? new Date(a.effective_to).getTime() : null;
        if (to !== null && to < now) return;
        (attachmentsByEntity[a.entity_id] ||= []).push(licence);
      });
      Object.values(attachmentsByEntity).forEach(list =>
        list.sort((a, b) => (a.license_number || '').localeCompare(b.license_number || '')));

      const licensees = (licRes.data || []) as any[];
      const appIds = Array.from(new Set(
        licensees.flatMap(l => (attachmentsByEntity[l.id] || []).map(x => x.application_id)).filter(Boolean)
      )) as string[];

      const appsMap: Record<string, any> = {};
      const applicantIds: string[] = [];
      if (appIds.length) {
        const { data: appsData } = await supabase
          .from('applications')
          .select('id, applicant_id, created_at, data')
          .in('id', appIds);
        (appsData || []).forEach((a: any) => {
          appsMap[a.id] = a;
          if (a.applicant_id) applicantIds.push(a.applicant_id);
        });
      }

      const uniqApplicants = Array.from(new Set(applicantIds));
      const regMap: Record<string, any> = {};
      const profileMap: Record<string, any> = {};
      const plMap: Record<string, any> = {};
      if (uniqApplicants.length) {
        const [regsRes, profRes, plRes] = await Promise.all([
          supabase.from('registrations')
            .select('user_id, applicant_name, first_name, last_name, created_at, sector_id, sub_sector_id, category_id')
            .in('user_id', uniqApplicants),
          supabase.from('profiles').select('id, full_name, entity_name').in('id', uniqApplicants),
          supabase.from('pre_license_users').select('id, full_name, entity_name').in('id', uniqApplicants),
        ]);
        (regsRes.data || []).forEach((r: any) => { regMap[r.user_id] = r; });
        (profRes.data || []).forEach((p: any) => { profileMap[p.id] = p; });
        (plRes.data || []).forEach((p: any) => { plMap[p.id] = p; });
      }

      const buildRow = (l: any, licence: LicenceRec | null): LicenseeRow => {
        const appId = licence?.application_id ?? null;
        const app = appId ? appsMap[appId] : null;
        const reg = app?.applicant_id ? regMap[app.applicant_id] : null;
        const prof = app?.applicant_id ? profileMap[app.applicant_id] : null;
        const pl = app?.applicant_id ? plMap[app.applicant_id] : null;
        const data = app?.data || {};

        const licenseeName =
          l.name ||
          reg?.applicant_name ||
          data?.applicant_name ||
          data?.entity_name ||
          pl?.entity_name ||
          prof?.entity_name ||
          '—';

        const contactName =
          [reg?.first_name, reg?.last_name].filter(Boolean).join(' ') ||
          [data?.first_name, data?.last_name].filter(Boolean).join(' ') ||
          prof?.full_name ||
          pl?.full_name ||
          '—';

        const sectorId = l.sector_id || data?.sector_id || reg?.sector_id;
        const subSectorId = l.sub_sector_id || data?.sub_sector_id || reg?.sub_sector_id;
        const categoryId = l.category_id || data?.category_id || reg?.category_id;

        // Licence status comes from licenses.status — NEVER licensees.status.
        return {
          rowKey: licence ? `${l.id}:${licence.id}` : l.id,
          id: l.id,
          status: licence?.status || 'unlicensed',
          licensed: !!licence,
          sector_id: l.sector_id,
          sub_sector_id: l.sub_sector_id,
          category_id: l.category_id,
          license_id: licence?.id ?? null,
          created_at: l.created_at,
          licensee_name: licenseeName,
          contact_name: contactName,
          license_number: licence?.license_number || '—',
          license_type: licence?.license_type || '—',
          sector_name: (sectorId && sMap[sectorId]) || data?.sector_name || '—',
          sub_sector_name: (subSectorId && ssMap[subSectorId]) || data?.sub_sector_name || '—',
          category_name: (categoryId && cMap[categoryId]) || data?.category_name || '—',
          registered_at: reg?.created_at || app?.created_at || l.created_at,
          application_id: appId,
          valid_until: licence?.valid_until ?? null,
        };
      };

      const enriched: LicenseeRow[] = licensees.flatMap(l => {
        const attachments = attachmentsByEntity[l.id] || [];
        if (!attachments.length) return [buildRow(l, null)];
        return attachments.map(licence => buildRow(l, licence));
      });



      setRows(enriched);
      setLoading(false);
    }
    load();
  }, []);

  const sectorList = useMemo(() => Object.entries(sectors).sort((a, b) => a[1].localeCompare(b[1])), [sectors]);
  const statusOptions = useMemo(() => [...new Set(rows.map(r => r.status))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = rows.filter(r => {
      if (sectorFilter !== 'all' && r.sector_id !== sectorFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q) {
        const hay = [r.licensee_name, r.contact_name, r.license_number, r.sector_name, r.sub_sector_name, r.category_name]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sortBy === 'registered_at') {
        const av = a.registered_at ? new Date(a.registered_at).getTime() : 0;
        const bv = b.registered_at ? new Date(b.registered_at).getTime() : 0;
        return bv - av;
      }
      if (sortBy === 'licensee_name') return a.licensee_name.localeCompare(b.licensee_name);
      return a.sector_name.localeCompare(b.sector_name);
    });
    return list;
  }, [rows, sectorFilter, statusFilter, search, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  // Licence-holder counts are derived from canonical attachments only.
  const licensedRows = rows.filter(r => r.licensed);
  const activeCount = licensedRows.filter(r => r.status === 'active').length;
  const unlicensedCount = rows.length - licensedRows.length;

  const renderStatusCell = (row: LicenseeRow) => {
    if (!row.licensed) {
      return <Badge variant="outline" data-testid="status-unlicensed">Not licensed</Badge>;
    }
    const grace = expiryConfig?.resolveFor({
      sector_id: row.sector_id,
      sub_sector_id: row.sub_sector_id,
      category_id: row.category_id,
    }).grace_period_days ?? 0;
    const days = daysUntil(row.valid_until);

    // Honor grace period: a license past valid_until but inside grace is still
    // "Active (Grace)", not "Expired". The shared LicenseStatusBadge resolves
    // this exactly like the rest of the app.
    if (row.status === 'active' && days !== null && days >= 0 && days <= 7) {
      return (
        <Badge className="animate-pulse bg-amber-500 text-white hover:bg-amber-500">
          Expiring in {days}{grace > 0 ? ` + ${grace} days grace` : ' days'}
        </Badge>
      );
    }
    return <LicenseStatusBadge status={row.status} validUntil={row.valid_until} gracePeriodDays={grace} />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Licensee Entities"
          description="One row per canonical licence attachment. Entities without a licence in the canonical register are shown as Not licensed."
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Licence Records" value={rows.length} icon={<Briefcase className="h-6 w-6" />} />
          <StatCard title="Active Licences" value={activeCount} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Not Licensed" value={unlicensedCount} icon={<Briefcase className="h-6 w-6" />} />
          <StatCard title="Sectors" value={sectorList.length} icon={<Layers className="h-6 w-6" />} variant="primary" />
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, contact, sector..."
                  className="pl-10"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                />
              </div>
              <Select value={sectorFilter} onValueChange={v => { setSectorFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Sectors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sectors</SelectItem>
                  {sectorList.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statusOptions.map(s => (<SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="registered_at">Sort: Registered Date</SelectItem>
                  <SelectItem value="licensee_name">Sort: Licensee Name</SelectItem>
                  <SelectItem value="sector_name">Sort: Sector</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Licensee Name</TableHead>
                      <TableHead>Licence No. / Type</TableHead>
                      <TableHead>Contact Name</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Sub Sector</TableHead>
                      <TableHead>Category / Service</TableHead>
                      <TableHead>Registered At</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          No licensees found.
                        </TableCell>
                      </TableRow>
                    ) : paged.map(row => (
                      <TableRow key={row.rowKey} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/entities/${row.id}`)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <span className="font-medium text-foreground">{row.licensee_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-mono" data-testid="licence-number">
                          {row.license_number}
                          {row.licensed && row.license_type !== '—' && (
                            <div className="font-sans text-xs text-muted-foreground">{row.license_type}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{row.contact_name}</TableCell>
                        <TableCell className="text-sm">{row.sector_name}</TableCell>
                        <TableCell className="text-sm">{row.sub_sector_name}</TableCell>
                        <TableCell className="text-sm">{row.category_name}</TableCell>
                        <TableCell className="text-sm">{fmtDate(row.registered_at)}</TableCell>
                        <TableCell>{renderStatusCell(row)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); navigate(`/entities/${row.id}`); }}>
                            <Eye className="h-4 w-4 mr-1" />View
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
