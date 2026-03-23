import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2, Download, Eye, ChevronLeft, ChevronRight, Shield } from 'lucide-react';

interface ApprovedApp {
  id: string;
  application_number: string;
  applicant_id: string;
  license_type: string;
  approved_at: string | null;
  data: Record<string, unknown>;
}

interface License {
  id: string;
  license_number: string;
  application_id: string;
  status: string;
  issued_at: string;
}

interface Licensee {
  id: string;
  license_id: string | null;
  name: string;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
}

const PAGE_SIZE = 10;

export default function ApprovedLicensees() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<ApprovedApp[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [appRes, licRes, profRes, preLicRes] = await Promise.all([
        supabase.from('applications').select('*').eq('status', 'approved').order('approved_at', { ascending: false }),
        supabase.from('licenses').select('id, license_number, application_id, status, issued_at'),
        supabase.from('profiles').select('id, full_name, email'),
        supabase.from('pre_license_users' as any).select('id, full_name, email'),
      ]);
      if (appRes.data) setApps(appRes.data as any);
      if (licRes.data) setLicenses(licRes.data as any);
      setProfiles([...((profRes.data || []) as any), ...((preLicRes.data || []) as any)]);
      setLoading(false);
    }
    load();
  }, []);

  const getName = (id: string) => profiles.find(p => p.id === id)?.full_name || '—';
  const getEmail = (id: string) => profiles.find(p => p.id === id)?.email || '';
  const getLicense = (appId: string) => licenses.find(l => l.application_id === appId);

  const filtered = useMemo(() => {
    if (!search) return apps;
    const q = search.toLowerCase();
    return apps.filter(a => {
      const name = getName(a.applicant_id).toLowerCase();
      const lic = getLicense(a.id);
      return a.application_number.toLowerCase().includes(q)
        || name.includes(q)
        || a.license_type.toLowerCase().includes(q)
        || (lic?.license_number || '').toLowerCase().includes(q);
    });
  }, [apps, search, profiles, licenses]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Approved Licensees"
          description="All approved pre-license applications with issued license numbers"
          actions={
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />Export
            </Button>
          }
        />

        <Card>
          <CardContent className="pt-6">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, application #, license #..."
                className="pl-10"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
              />
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Application #</TableHead>
                    <TableHead>Entity Name</TableHead>
                    <TableHead>License Type</TableHead>
                    <TableHead>Licensee Number</TableHead>
                    <TableHead>License Status</TableHead>
                    <TableHead>Approval Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                        No approved applications found.
                      </TableCell>
                    </TableRow>
                  ) : paged.map(app => {
                    const lic = getLicense(app.id);
                    const entityName = (app.data as any)?.entity_name
                      || (app.data as any)?.applicant_name
                      || getName(app.applicant_id);
                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-mono font-medium text-sm">{app.application_number}</TableCell>
                        <TableCell>{entityName}</TableCell>
                        <TableCell>{app.license_type}</TableCell>
                        <TableCell>
                          {lic ? (
                            <div className="flex items-center gap-1.5">
                              <Shield className="h-3.5 w-3.5 text-primary" />
                              <span className="font-mono text-sm font-medium">{lic.license_number}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Pending</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={lic?.status === 'active' ? 'default' : 'outline'} className="text-xs capitalize">
                            {lic?.status || 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {app.approved_at ? new Date(app.approved_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/applications/${app.id}`)}>
                            <Eye className="h-4 w-4 mr-1" />View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
