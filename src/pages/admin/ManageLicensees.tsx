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

interface LicenseeRow {
  id: string;
  name: string;
  status: string;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  license_id: string | null;
  created_at: string;
  license_number?: string;
  license_status?: string;
  approved_date?: string;
}

interface LookupMap { [id: string]: string }

const PAGE_SIZE = 10;

export default function ManageLicensees() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LicenseeRow[]>([]);
  const [sectors, setSectors] = useState<LookupMap>({});
  const [subSectors, setSubSectors] = useState<LookupMap>({});
  const [categories, setCategories] = useState<LookupMap>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [licRes, secRes, subRes, catRes, licensesRes] = await Promise.all([
        supabase.from('licensees').select('*').order('name'),
        supabase.from('sectors').select('id, name').eq('status', 'active'),
        supabase.from('sub_sectors').select('id, name').eq('status', 'active'),
        supabase.from('categories').select('id, name').eq('status', 'active'),
        supabase.from('licenses').select('id, license_number, status, issued_at'),
      ]);

      const sMap: LookupMap = {};
      (secRes.data || []).forEach(s => { sMap[s.id] = s.name; });
      setSectors(sMap);

      const ssMap: LookupMap = {};
      (subRes.data || []).forEach(s => { ssMap[s.id] = s.name; });
      setSubSectors(ssMap);

      const cMap: LookupMap = {};
      (catRes.data || []).forEach(c => { cMap[c.id] = c.name; });
      setCategories(cMap);

      const licenseMap: Record<string, { number: string; status: string; date: string }> = {};
      (licensesRes.data || []).forEach(l => {
        licenseMap[l.id] = { number: l.license_number, status: l.status, date: l.issued_at };
      });

      const enriched: LicenseeRow[] = ((licRes.data || []) as any[]).map(l => ({
        ...l,
        license_number: l.license_id ? licenseMap[l.license_id]?.number : undefined,
        license_status: l.license_id ? licenseMap[l.license_id]?.status : undefined,
        approved_date: l.license_id ? licenseMap[l.license_id]?.date : undefined,
      }));

      setRows(enriched);
      setLoading(false);
    }
    load();
  }, []);

  const sectorList = useMemo(() => Object.entries(sectors).sort((a, b) => a[1].localeCompare(b[1])), [sectors]);
  const statusOptions = useMemo(() => [...new Set(rows.map(r => r.status))].sort(), [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (sectorFilter !== 'all' && r.sector_id !== sectorFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, sectorFilter, statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const activeCount = rows.filter(r => r.status === 'active').length;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
      inactive: 'bg-muted text-muted-foreground border-border',
    };
    return (
      <Badge variant="outline" className={`capitalize ${map[status] || ''}`}>
        {status}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Licensee Entities"
          description="Manage licensee organizations with their license and classification details."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Total Licensees" value={rows.length} icon={<Briefcase className="h-6 w-6" />} />
          <StatCard title="Active" value={activeCount} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Sectors" value={sectorList.length} icon={<Layers className="h-6 w-6" />} variant="primary" />
        </div>

        {/* Toolbar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by company name..."
                  className="pl-10"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                />
              </div>
              <Select value={sectorFilter} onValueChange={v => { setSectorFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Sectors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sectors</SelectItem>
                  {sectorList.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statusOptions.map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Licensee Name</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Sub-Sector</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>License #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        No licensees found.
                      </TableCell>
                    </TableRow>
                  ) : paged.map(row => (
                    <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/licensees/${row.id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <span className="font-medium text-foreground">{row.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{row.sector_id ? sectors[row.sector_id] || '—' : '—'}</TableCell>
                      <TableCell className="text-sm">{row.sub_sector_id ? subSectors[row.sub_sector_id] || '—' : '—'}</TableCell>
                      <TableCell className="text-sm">{row.category_id ? categories[row.category_id] || '—' : '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{row.license_number || '—'}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); navigate(`/admin/licensees/${row.id}`); }}>
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

        {/* Pagination */}
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
