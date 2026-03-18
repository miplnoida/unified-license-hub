import { useState, useEffect, useMemo } from 'react';
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
import { Building2, Search, Loader2, CheckCircle, ChevronLeft, ChevronRight, Briefcase, Layers } from 'lucide-react';

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
  const [rows, setRows] = useState<LicenseeRow[]>([]);
  const [sectors, setSectors] = useState<LookupMap>({});
  const [subSectors, setSubSectors] = useState<LookupMap>({});
  const [categories, setCategories] = useState<LookupMap>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [licRes, secRes, subRes, catRes, licensesRes] = await Promise.all([
        supabase.from('licensees').select('*').eq('status', 'active').order('name'),
        supabase.from('sectors').select('id, name').eq('status', 'active'),
        supabase.from('sub_sectors').select('id, name').eq('status', 'active'),
        supabase.from('categories').select('id, name').eq('status', 'active'),
        supabase.from('licenses').select('id, license_number, status, issued_at').eq('status', 'active'),
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

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (sectorFilter !== 'all' && r.sector_id !== sectorFilter) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, sectorFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach(r => {
      const name = r.sector_id ? (sectors[r.sector_id] || 'Unknown') : 'Unassigned';
      counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }, [rows, sectors]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Licensee Entities"
          description="Approved licensee organizations with their license and classification details."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Approved Licensees" value={rows.length} icon={<Briefcase className="h-6 w-6" />} />
          <StatCard title="Sectors" value={sectorList.length} icon={<Layers className="h-6 w-6" />} variant="primary" />
          <StatCard title="With License #" value={rows.filter(r => r.license_number).length} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
        </div>

        {/* Toolbar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search licensees..."
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
                    <TableHead>Approval Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        No approved licensees found.
                      </TableCell>
                    </TableRow>
                  ) : paged.map(row => (
                    <TableRow key={row.id}>
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
                      <TableCell className="text-sm text-muted-foreground">
                        {row.approved_date ? new Date(row.approved_date).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="capitalize bg-emerald-500/10 text-emerald-700 border-emerald-200">
                          Approved
                        </Badge>
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

        {/* Sector distribution */}
        {!loading && Object.keys(sectorCounts).length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Sector-wise Distribution</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                <Card key={name}>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-sm text-muted-foreground">{name}</p>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">licensee{count !== 1 ? 's' : ''}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
