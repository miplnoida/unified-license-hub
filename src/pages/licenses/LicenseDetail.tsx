import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { LICENSE_STATUS_LABELS, LicenseStatus, INTERNAL_ROLES } from '@/types/platform';
import { Loader2, PauseCircle, XCircle, RotateCcw, RefreshCw } from 'lucide-react';

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
  compliance_requirements: any;
  application_id: string | null;
  created_at: string;
  updated_at: string;
}

interface LicenseAction {
  id: string;
  action_type: string;
  actor_id: string;
  reason: string | null;
  old_status: string;
  new_status: string;
  created_at: string;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default', suspended: 'outline', revoked: 'destructive', expired: 'secondary', cancelled: 'destructive',
};

export default function LicenseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [license, setLicense] = useState<License | null>(null);
  const [actions, setActions] = useState<LicenseAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const isInternal = user && INTERNAL_ROLES.includes(user.role);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const { data } = await supabase.from('licenses' as any).select('*').eq('id', id).single();
      if (data) setLicense(data as any);
      const { data: acts } = await supabase.from('license_actions' as any).select('*').eq('license_id', id).order('created_at', { ascending: false });
      if (acts) setActions(acts as any);
      setLoading(false);
    }
    load();
  }, [id]);

  const handleAction = async (actionType: string, newStatus: LicenseStatus) => {
    if (!license || !user) return;
    setProcessing(true);
    const oldStatus = license.status;

    await supabase.from('license_actions' as any).insert({
      license_id: license.id, action_type: actionType, actor_id: user.id,
      reason: reason || null, old_status: oldStatus, new_status: newStatus,
    } as any);

    await supabase.from('licenses' as any).update({ status: newStatus, updated_at: new Date().toISOString() } as any).eq('id', license.id);
    await logAudit({ action: `license_${actionType}`, entityType: 'license', entityId: license.id, oldValue: { status: oldStatus }, newValue: { status: newStatus, reason } });

    toast.success(`License ${actionType} successful`);
    setLicense(prev => prev ? { ...prev, status: newStatus } : prev);
    setReason('');
    setProcessing(false);

    const { data: acts } = await supabase.from('license_actions' as any).select('*').eq('license_id', license.id).order('created_at', { ascending: false });
    if (acts) setActions(acts as any);
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  if (!license) return <DashboardLayout><div className="text-center py-12 text-muted-foreground">License not found</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`License ${license.license_number}`}
          description={license.license_type}
          backHref="/licenses"
          backLabel="Back to Licenses"
          actions={<Badge variant={statusVariant[license.status] || 'outline'} className="text-sm px-3 py-1 capitalize">{LICENSE_STATUS_LABELS[license.status]}</Badge>}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>License Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">License Number</p><p className="font-mono font-medium">{license.license_number}</p></div>
                  <div><p className="text-sm text-muted-foreground">Type</p><p className="font-medium">{license.license_type}</p></div>
                  <div><p className="text-sm text-muted-foreground">Issued</p><p>{new Date(license.issued_at).toLocaleDateString()}</p></div>
                  <div><p className="text-sm text-muted-foreground">Valid From</p><p>{new Date(license.valid_from).toLocaleDateString()}</p></div>
                  <div><p className="text-sm text-muted-foreground">Valid Until</p><p>{license.valid_until ? new Date(license.valid_until).toLocaleDateString() : 'No Expiry'}</p></div>
                  {license.conditions && <div className="col-span-2"><p className="text-sm text-muted-foreground">Conditions</p><p className="text-sm">{license.conditions}</p></div>}
                </div>
              </CardContent>
            </Card>

            {isInternal && license.status !== 'revoked' && license.status !== 'cancelled' && (
              <Card>
                <CardHeader><CardTitle>License Actions</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><Label>Reason / Notes</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Enter reason..." rows={2} /></div>
                  <div className="flex gap-2 flex-wrap">
                    {license.status === 'active' && (
                      <>
                        <Button variant="outline" onClick={() => handleAction('suspension', 'suspended')} disabled={processing}><PauseCircle className="h-4 w-4 mr-1" />Suspend</Button>
                        <Button variant="destructive" onClick={() => handleAction('revocation', 'revoked')} disabled={processing}><XCircle className="h-4 w-4 mr-1" />Revoke</Button>
                        <Button variant="outline" onClick={() => handleAction('renewal', 'active')} disabled={processing}><RefreshCw className="h-4 w-4 mr-1" />Renew</Button>
                      </>
                    )}
                    {license.status === 'suspended' && (
                      <>
                        <Button onClick={() => handleAction('reinstatement', 'active')} disabled={processing}><RotateCcw className="h-4 w-4 mr-1" />Reinstate</Button>
                        <Button variant="destructive" onClick={() => handleAction('cancellation', 'cancelled')} disabled={processing}><XCircle className="h-4 w-4 mr-1" />Cancel</Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            <Card>
              <CardHeader><CardTitle className="text-base">Action History</CardTitle></CardHeader>
              <CardContent>
                {actions.length === 0 ? <p className="text-sm text-muted-foreground">No actions recorded</p> : (
                  <div className="space-y-3">
                    {actions.map(a => (
                      <div key={a.id} className="border-l-2 border-border pl-3 py-1">
                        <Badge variant="outline" className="text-xs capitalize mb-1">{a.action_type}</Badge>
                        <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                        <p className="text-xs">{a.old_status} → {a.new_status}</p>
                        {a.reason && <p className="text-xs text-muted-foreground italic mt-1">"{a.reason}"</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
