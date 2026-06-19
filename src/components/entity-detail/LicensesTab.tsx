import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Shield, Eye } from 'lucide-react';
import { formatTaxonomyLabel } from '@/lib/formatTaxonomyLabel';
import { useNavigate } from 'react-router-dom';

interface LicensesTabProps {
  entityId: string;
  licenseId: string | null;
}

export default function LicensesTab({ entityId, licenseId }: LicensesTabProps) {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      if (!licenseId) { setLoading(false); return; }
      const { data } = await supabase.from('licenses').select('*').eq('id', licenseId);
      setLicenses(data || []);
      setLoading(false);
    })();
  }, [licenseId]);

  const statusColor = (s: string) => {
    if (s === 'active') return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
    if (s === 'expired') return 'bg-destructive/10 text-destructive border-destructive/20';
    if (s === 'suspended') return 'bg-warning/10 text-warning border-warning/20';
    return '';
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Shield className="h-5 w-5 text-primary" />Licenses & Registrations</CardTitle>
      </CardHeader>
      <CardContent>
        {licenses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No licenses linked to this entity.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>License Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Valid From</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenses.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono">{l.license_number}</TableCell>
                  <TableCell>{l.license_type}</TableCell>
                  <TableCell>{new Date(l.issued_at).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(l.valid_from).toLocaleDateString()}</TableCell>
                  <TableCell>{l.valid_until ? new Date(l.valid_until).toLocaleDateString() : 'No expiry'}</TableCell>
                  <TableCell><Badge variant="outline" className={`capitalize ${statusColor(l.status)}`}>{l.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/licenses/${l.id}`)}>
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
  );
}
