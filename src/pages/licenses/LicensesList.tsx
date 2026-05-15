import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { LICENSE_STATUS_LABELS, LicenseStatus, INTERNAL_ROLES } from '@/types/platform';
import { Search, Eye, Loader2, Shield } from 'lucide-react';

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
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default', suspended: 'outline', revoked: 'destructive', expired: 'secondary', cancelled: 'destructive',
};

export default function LicensesList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const isInternal = user && INTERNAL_ROLES.includes(user.role);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.from('licenses' as any).select('*').order('created_at', { ascending: false });
      if (!error) setLicenses((data || []) as any);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = licenses.filter(l => {
    if (search && !l.license_number.toLowerCase().includes(search.toLowerCase()) &&
        !l.license_type.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={isInternal ? 'License Management' : 'My Licenses'}
          description={isInternal ? 'Manage all issued licenses' : 'View your active licenses and compliance'}
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

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>License #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No licenses found</TableCell></TableRow>
                  ) : filtered.map(lic => (
                    <TableRow key={lic.id}>
                      <TableCell className="font-mono font-medium text-sm">{lic.license_number}</TableCell>
                      <TableCell>{lic.license_type}</TableCell>
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
