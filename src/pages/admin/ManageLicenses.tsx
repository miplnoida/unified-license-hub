import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/dashboard/StatCard';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Search, Loader2, Building2, ChevronLeft, ChevronRight, Eye, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Licensee {
  id: string;
  name: string;
  status: string;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  license_id: string | null;
  created_at: string;
}

interface Sector {
  id: string;
  name: string;
}

const PAGE_SIZE = 10;

export default function ManageLicenses() {
  const navigate = useNavigate();
  const [licensees, setLicensees] = useState<Licensee[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [licRes, secRes] = await Promise.all([
        supabase.from('licensees' as any).select('*').eq('status', 'active').order('name'),
        supabase.from('sectors' as any).select('id, name').eq('status', 'active'),
      ]);
      if (!licRes.error) setLicensees((licRes.data || []) as any);
      if (!secRes.error) setSectors((secRes.data || []) as any);
      setLoading(false);
    }
    load();
  }, []);

  const getSectorName = (id: string | null) => sectors.find(s => s.id === id)?.name || 'Unassigned';

  const filtered = useMemo(() => {
    return licensees.filter(l => {
      if (sectorFilter !== 'all' && l.sector_id !== sectorFilter) return false;
      if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [licensees, sectorFilter, search]);

  // Group by sector
  const grouped = useMemo(() => {
    const map: Record<string, { sectorName: string; items: Licensee[] }> = {};
    filtered.forEach(l => {
      const key = l.sector_id || 'unassigned';
      if (!map[key]) map[key] = { sectorName: getSectorName(l.sector_id), items: [] };
      map[key].items.push(l);
    });
    return Object.entries(map).sort((a, b) => a[1].sectorName.localeCompare(b[1].sectorName));
  }, [filtered, sectors]);

  // Flat list for pagination
  const flatFiltered = filtered;
  const totalPages = Math.ceil(flatFiltered.length / PAGE_SIZE);
  const paged = flatFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    licensees.forEach(l => {
      const name = getSectorName(l.sector_id);
      counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }, [licensees, sectors]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="License Types"
          description="Approved licensees grouped by sector."
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Licensees" value={licensees.length} icon={<Building2 className="h-6 w-6" />} />
          <StatCard title="Sectors" value={sectors.length} icon={<Shield className="h-6 w-6" />} variant="primary" />
          <StatCard title="Active" value={licensees.filter(l => l.status === 'active').length} icon={<Shield className="h-6 w-6" />} variant="success" />
          <StatCard title="With License" value={licensees.filter(l => l.license_id).length} icon={<Shield className="h-6 w-6" />} variant="warning" />
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
                  {sectors.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="ml-auto">
                <Download className="h-4 w-4 mr-2" />Export
              </Button>
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
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No approved licensees found.
                      </TableCell>
                    </TableRow>
                  ) : paged.map(lic => (
                    <TableRow key={lic.id}>
                      <TableCell className="font-medium">{lic.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getSectorName(lic.sector_id)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="capitalize">{lic.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(lic.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
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
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, flatFiltered.length)} of {flatFiltered.length}
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

        {/* Sector-wise summary cards */}
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
