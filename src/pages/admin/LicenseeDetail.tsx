import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Building2, Loader2, Shield, Calendar, Hash, Layers, Boxes, ListOrdered } from 'lucide-react';

interface LookupMap { [id: string]: string }

export default function LicenseeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [licensee, setLicensee] = useState<any>(null);
  const [license, setLicense] = useState<any>(null);
  const [sectors, setSectors] = useState<LookupMap>({});
  const [subSectors, setSubSectors] = useState<LookupMap>({});
  const [categories, setCategories] = useState<LookupMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      const [licRes, secRes, subRes, catRes] = await Promise.all([
        supabase.from('licensees').select('*').eq('id', id).single(),
        supabase.from('sectors').select('id, name'),
        supabase.from('sub_sectors').select('id, name'),
        supabase.from('categories').select('id, name'),
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

      if (licRes.data) {
        setLicensee(licRes.data);
        if (licRes.data.license_id) {
          const { data: lic } = await supabase.from('licenses').select('*').eq('id', licRes.data.license_id).single();
          setLicense(lic);
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
      inactive: 'bg-muted text-muted-foreground border-border',
    };
    return <Badge variant="outline" className={`capitalize ${map[status] || ''}`}>{status}</Badge>;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!licensee) {
    return (
      <DashboardLayout>
        <div className="text-center py-24">
          <p className="text-muted-foreground">Licensee not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/licensees')}>
            <ArrowLeft className="h-4 w-4 mr-2" />Back to Licensees
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const InfoItem = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | React.ReactNode }) => (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="font-medium text-foreground">{value || '—'}</div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={licensee.name}
          description="Licensee entity details"
          actions={
            <Button variant="outline" onClick={() => navigate('/admin/licensees')}>
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Company Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />Company Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoItem icon={<Building2 className="h-4 w-4" />} label="Company Name" value={licensee.name} />
              <Separator />
              <InfoItem icon={<Layers className="h-4 w-4" />} label="Sector" value={licensee.sector_id ? sectors[licensee.sector_id] : '—'} />
              <Separator />
              <InfoItem icon={<Boxes className="h-4 w-4" />} label="Sub-Sector" value={licensee.sub_sector_id ? subSectors[licensee.sub_sector_id] : '—'} />
              <Separator />
              <InfoItem icon={<ListOrdered className="h-4 w-4" />} label="Category" value={licensee.category_id ? categories[licensee.category_id] : '—'} />
              <Separator />
              <InfoItem icon={<Calendar className="h-4 w-4" />} label="Created" value={new Date(licensee.created_at).toLocaleDateString()} />
              <Separator />
              <InfoItem icon={<Shield className="h-4 w-4" />} label="Status" value={statusBadge(licensee.status)} />
            </CardContent>
          </Card>

          {/* License Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-primary" />License Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              {license ? (
                <div className="space-y-1">
                  <InfoItem icon={<Hash className="h-4 w-4" />} label="License Number" value={<span className="font-mono">{license.license_number}</span>} />
                  <Separator />
                  <InfoItem icon={<Shield className="h-4 w-4" />} label="License Type" value={license.license_type} />
                  <Separator />
                  <InfoItem icon={<Shield className="h-4 w-4" />} label="License Status" value={statusBadge(license.status)} />
                  <Separator />
                  <InfoItem icon={<Calendar className="h-4 w-4" />} label="Issued At" value={new Date(license.issued_at).toLocaleDateString()} />
                  <Separator />
                  <InfoItem icon={<Calendar className="h-4 w-4" />} label="Valid From" value={new Date(license.valid_from).toLocaleDateString()} />
                  <Separator />
                  <InfoItem icon={<Calendar className="h-4 w-4" />} label="Valid Until" value={license.valid_until ? new Date(license.valid_until).toLocaleDateString() : 'No expiry'} />
                  {license.conditions && (
                    <>
                      <Separator />
                      <div className="py-3">
                        <p className="text-sm text-muted-foreground mb-1">Conditions</p>
                        <p className="text-sm text-foreground">{license.conditions}</p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Shield className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">No license linked to this entity.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
