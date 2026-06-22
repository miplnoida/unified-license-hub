import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useLicenseExpiryConfig } from '@/hooks/useLicenseExpiryConfig';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { usePpoc } from '@/contexts/PpocContext';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useRegulator } from '@/contexts/RegulatorContext';
import { logAudit } from '@/hooks/useAuditLog';
import { dispatchNotificationEvent } from '@/lib/notificationEvents';
import { toast } from 'sonner';
import { LicenseStatus, INTERNAL_ROLES } from '@/types/platform';
import { Loader2, PauseCircle, XCircle, RotateCcw, RefreshCw, AlertTriangle, Ban, FileDown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatTaxonomyLabel } from '@/lib/formatTaxonomyLabel';
import { LicenseStatusBadge } from '@/lib/licenseStatusBadge';

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
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
}

interface RenewalFeeInfo {
  amount: number;
  currency: string;
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

const MANDATORY_REASON_ACTIONS = new Set(['suspension', 'revocation', 'cancellation']);
const MIN_REASON_LEN = 10;

function addYears(iso: string | null, years: number): string {
  const base = iso ? new Date(iso) : new Date();
  base.setFullYear(base.getFullYear() + years);
  return base.toISOString().slice(0, 10);
}

export default function LicenseDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const portalContext = useEffectivePortalContext();
  const { resolvedLicenseeId } = usePpoc();
  const { activeRegulator } = useRegulator();
  const { data: expiryConfig } = useLicenseExpiryConfig();
  const { data: formTemplates = [] } = useFormTemplates(undefined, activeRegulator?.id);
  const [license, setLicense] = useState<License | null>(null);
  const [actions, setActions] = useState<LicenseAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [startingRenewal, setStartingRenewal] = useState(false);
  const [renewalFee, setRenewalFee] = useState<RenewalFeeInfo | null>(null);
  const isInternal = !!user && !portalContext.loading && (portalContext.isInternal || INTERNAL_ROLES.includes(user.role));

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

  // Resolve renewal fee from Fee Management: a fee tagged "Renewal" tied to the
  // Renew service for this license's sub-sector. If no row exists, renewal is free.
  useEffect(() => {
    async function loadRenewalFee() {
      if (!license?.sub_sector_id) { setRenewalFee(null); return; }
      const { data: services } = await supabase
        .from('services' as any)
        .select('id')
        .eq('name', 'Renew')
        .eq('sub_sector_id', license.sub_sector_id);
      const serviceIds = (services as any[] | null)?.map((s) => s.id) || [];
      if (serviceIds.length === 0) { setRenewalFee(null); return; }
      const { data: fees } = await supabase
        .from('fee_configurations' as any)
        .select('amount, currency, sub_sector_id, category_id')
        .eq('is_active', true)
        .in('service_id', serviceIds)
        .ilike('fee_type', 'renewal');
      const rows = (fees as any[] | null) || [];
      const match = rows
        .filter((r) => !r.sub_sector_id || r.sub_sector_id === license.sub_sector_id)
        .filter((r) => !r.category_id || r.category_id === license.category_id)
        .sort(
          (a, b) =>
            ((b.category_id ? 2 : 0) + (b.sub_sector_id ? 1 : 0)) -
            ((a.category_id ? 2 : 0) + (a.sub_sector_id ? 1 : 0)),
        )[0];
      if (match && Number(match.amount) > 0) {
        setRenewalFee({ amount: Number(match.amount), currency: match.currency || 'USD' });
      } else {
        setRenewalFee(null);
      }
    }
    loadRenewalFee();
  }, [license?.sub_sector_id, license?.category_id]);

  const licensePolicy = license
    ? expiryConfig?.resolveFor({
        sector_id: license.sector_id,
        sub_sector_id: license.sub_sector_id,
        category_id: license.category_id,
      })
    : undefined;
  const periodDays = licensePolicy?.cycle_type === 'periodic' ? (licensePolicy.period_days || 365) : 365;
  const isLicenseExpired = !!license && (
    license.status === 'expired' ||
    (!!license.valid_until && new Date(license.valid_until).getTime() < new Date().setHours(0, 0, 0, 0))
  );

  // Auto-calculated next valid_until based on the sector's renewal policy.
  // Read-only — users cannot override it from the renewal form.
  const computedNewValidUntil = (() => {
    if (!license) return '';
    const base = license.valid_until ? new Date(license.valid_until) : new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // If the license has already expired, extend from today rather than the past date.
    if (base.getTime() < today.getTime()) base.setTime(today.getTime());
    base.setDate(base.getDate() + periodDays);
    return base.toISOString().slice(0, 10);
  })();

  // Resolve the renewal form template for this license.
  // Priority: service named "Renew" → sub_sector_id → sector_id → name contains "Renewal".
  const resolveRenewalTemplate = () => {
    const published = (formTemplates || []).filter(
      (t: any) => t.status === 'published' && t.form_type === 'post_license',
    );
    if (!published.length) return null;

    if (license?.sub_sector_id) {
      const byService = published.filter(
        (t: any) =>
          (t.service_name || t.service || '').toLowerCase() === 'renew' &&
          t.sub_sector_id === license.sub_sector_id,
      );
      if (byService.length) return byService[0];
    }
    if (license?.sub_sector_id) {
      const bySub = published.filter(
        (t: any) => t.sub_sector_id === license.sub_sector_id && /renew/i.test(t.name || ''),
      );
      if (bySub.length) return bySub[0];
    }
    if (license?.sector_id) {
      const bySector = published.filter(
        (t: any) => t.sector_id === license.sector_id && /renew/i.test(t.name || ''),
      );
      if (bySector.length) return bySector[0];
    }
    // Final fallback: any "Renewal" template whose name best matches the license type
    const renewalOnly = published.filter((t: any) => /renew/i.test(t.name || ''));
    if (!renewalOnly.length) return null;
    const type = (license?.license_type || '').toLowerCase();
    const scored = renewalOnly
      .map((t: any) => {
        const name = (t.name || '').toLowerCase();
        let score = 0;
        for (const word of type.split(/[^a-z0-9]+/).filter((w) => w.length > 3)) {
          if (name.includes(word)) score += 1;
        }
        return { t, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.t || renewalOnly[0];
  };

  const startRenewal = async () => {
    if (!license || !user) return;
    if (startingRenewal) return;
    const template = resolveRenewalTemplate();
    if (!template) {
      toast.error('No renewal form is configured for this license.');
      return;
    }
    setStartingRenewal(true);
    try {
      const { data, error } = await supabase
        .from('applications')
        .insert({
          applicant_id: user.id,
          license_type: license.license_type,
          status: 'draft',
          data: {
            ...(resolvedLicenseeId ? { licensee_id: resolvedLicenseeId } : {}),
            sector_id: license.sector_id,
            sub_sector_id: license.sub_sector_id,
            category_id: license.category_id,
            service_id: (template as any).service_id || null,
            form_template_ids: [template.id],
            renewal_of_license_id: license.id,
            renewal_of_license_number: license.license_number,
            computed_new_valid_until: computedNewValidUntil,
            previous_valid_until: license.valid_until,
            is_renewal: true,
          },
          regulator_id: activeRegulator?.id || null,
        } as any)
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'license_renewal_started',
        entityType: 'license',
        entityId: license.id,
        newValue: {
          application_id: (data as any).id,
          new_valid_until: computedNewValidUntil,
          form_template_id: template.id,
        },
      });

      toast.success('Renewal form opened. Complete it and submit your renewal request.');
      navigate(`/post-licensee/applications/${(data as any).id}/forms?service=Renew`);
    } catch (err: any) {
      toast.error('Failed to start renewal: ' + (err?.message || 'Unknown error'));
    } finally {
      setStartingRenewal(false);
    }
  };

  // Auto-trigger when ?action=renew is present.
  useEffect(() => {
    if (license && searchParams.get('action') === 'renew' && !startingRenewal) {
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
      if (isLicenseExpired) startRenewal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [license, formTemplates]);

  const openSignedUrl = async (url: string) => {
    // Fetch as blob and trigger a same-origin download to avoid Chrome blocking
    // cross-origin PDF navigations from the preview iframe.
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `license-certificate-${license?.license_number || 'certificate'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      // Fallback: try opening in a new tab
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const downloadCertificate = async () => {
    if (!license) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-license-certificate', {
        body: { mode: 'download', license_id: license.id },
      });
      if (error || (data as any)?.error) {
        // Try generating then download
        await supabase.functions.invoke('generate-license-certificate', {
          body: { mode: 'generate', license_id: license.id },
        });
        const retry = await supabase.functions.invoke('generate-license-certificate', {
          body: { mode: 'download', license_id: license.id },
        });
        const url = (retry.data as any)?.url;
        if (!url) { toast.error('Failed to load certificate'); setDownloading(false); return; }
        await openSignedUrl(url);
      } else {
        await openSignedUrl((data as any).url);
      }
    } finally {
      setDownloading(false);
    }
  };


  const handleAction = async (actionType: string, newStatus: LicenseStatus) => {
    if (!license || !user) return;
    if (MANDATORY_REASON_ACTIONS.has(actionType) && reason.trim().length < MIN_REASON_LEN) {
      toast.error(`Please provide a justification of at least ${MIN_REASON_LEN} characters.`);
      return;
    }
    setProcessing(true);
    const oldStatus = license.status;

    await supabase.from('license_actions' as any).insert({
      license_id: license.id, action_type: actionType, actor_id: user.id,
      reason: reason || null, old_status: oldStatus, new_status: newStatus,
    } as any);

    await supabase.from('licenses' as any).update({ status: newStatus, updated_at: new Date().toISOString() } as any).eq('id', license.id);

    // Mirror revocation/cancellation onto the linked licensee row
    if (newStatus === 'revoked' || newStatus === 'cancelled') {
      await supabase.from('licensees' as any).update({ status: newStatus } as any).eq('license_id', license.id);
    }

    await logAudit({ action: `license_${actionType}`, entityType: 'license', entityId: license.id, oldValue: { status: oldStatus }, newValue: { status: newStatus, reason } });

    const eventKeyMap: Record<string, string> = {
      suspension: 'license.suspended',
      revocation: 'license.revoked',
      renewal: 'license.renewed',
      reinstatement: 'license.reinstated',
      cancellation: 'license.cancelled',
    };
    const eventKey = eventKeyMap[actionType] || 'license.status_changed';
    dispatchNotificationEvent({
      event_key: eventKey,
      entity_type: 'license',
      entity_id: license.id,
      payload: {
        license_id: license.id,
        license_number: license.license_number,
        license_type: license.license_type,
        old_status: oldStatus,
        new_status: newStatus,
        reason: reason || '',
        valid_until: license.valid_until ? new Date(license.valid_until).toISOString().slice(0, 10) : '',
        holder_user_id: license.holder_id,
      },
    });

    toast.success(`License ${actionType} successful`);
    setLicense(prev => prev ? { ...prev, status: newStatus } : prev);
    setReason('');
    setProcessing(false);

    const { data: acts } = await supabase.from('license_actions' as any).select('*').eq('license_id', license.id).order('created_at', { ascending: false });
    if (acts) setActions(acts as any);
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  if (!license) return <DashboardLayout><div className="text-center py-12 text-muted-foreground">License not found</div></DashboardLayout>;

  const revokeDisabled = processing || reason.trim().length < MIN_REASON_LEN;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`License ${license.license_number}`}
          description={formatTaxonomyLabel(license.license_type)}
          backHref="/licenses"
          backLabel="Back to Licenses"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadCertificate} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
                Signed Certificate
              </Button>
              <LicenseStatusBadge status={license.status} validUntil={license.valid_until} />
            </div>
          }
        />

        {(() => {
          const alertMap: Record<string, { title: string; variant: 'destructive' | 'default'; icon: any; actionTypes: string[] }> = {
            suspended: { title: 'This license is currently suspended.', variant: 'default', icon: AlertTriangle, actionTypes: ['suspension'] },
            revoked: { title: 'This license has been revoked.', variant: 'destructive', icon: Ban, actionTypes: ['revocation'] },
            cancelled: { title: 'This license has been cancelled.', variant: 'destructive', icon: Ban, actionTypes: ['cancellation'] },
            expired: { title: 'This license has expired.', variant: 'default', icon: AlertTriangle, actionTypes: [] },
          };
          const meta = alertMap[license.status];
          if (!meta) return null;
          const latest = actions.find(a => meta.actionTypes.includes(a.action_type)) || actions.find(a => a.new_status === license.status);
          const Icon = meta.icon;
          return (
            <Alert variant={meta.variant} className={meta.variant === 'default' ? 'border-warning/40 bg-warning/5' : ''}>
              <Icon className="h-4 w-4" />
              <AlertTitle>{meta.title}</AlertTitle>
              {latest && (
                <AlertDescription className="mt-1 space-y-1 text-sm">
                  <div>Effective: {new Date(latest.created_at).toLocaleString()}</div>
                  {latest.reason && <div>Justification: {latest.reason}</div>}
                </AlertDescription>
              )}
            </Alert>
          );
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>License Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">License Number</p><p className="font-mono font-medium">{license.license_number}</p></div>
                  <div><p className="text-sm text-muted-foreground">Type</p><p className="font-medium">{formatTaxonomyLabel(license.license_type)}</p></div>
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
                  <div>
                    <Label>Justification / Notes <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder={`Required for revoke/suspend/cancel (min ${MIN_REASON_LEN} characters)...`}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {reason.trim().length}/{MIN_REASON_LEN}+ characters
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {license.status === 'active' && (
                      <>
                        <Button variant="outline" onClick={() => handleAction('suspension', 'suspended')} disabled={revokeDisabled}><PauseCircle className="h-4 w-4 mr-1" />Suspend</Button>
                        <Button variant="destructive" onClick={() => handleAction('revocation', 'revoked')} disabled={revokeDisabled}><XCircle className="h-4 w-4 mr-1" />Revoke</Button>
                        <Button variant="outline" onClick={startRenewal} disabled={processing || startingRenewal}>
                          {startingRenewal ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                          Renew
                        </Button>
                      </>
                    )}
                    {license.status === 'suspended' && (
                      <>
                        <Button onClick={() => handleAction('reinstatement', 'active')} disabled={processing}><RotateCcw className="h-4 w-4 mr-1" />Reinstate</Button>
                        <Button variant="destructive" onClick={() => handleAction('cancellation', 'cancelled')} disabled={revokeDisabled}><XCircle className="h-4 w-4 mr-1" />Cancel</Button>
                      </>
                    )}
                    {license.status === 'expired' && (
                      <Button variant="outline" onClick={startRenewal} disabled={processing || startingRenewal}>
                        {startingRenewal ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                        Renew
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Renewal panel visible to license holder only after expiry */}
            {!isInternal && user?.id === license.holder_id && license.valid_until && (() => {
              const days = Math.ceil((new Date(license.valid_until).getTime() - new Date().setHours(0,0,0,0)) / 86_400_000);
              const expired = isLicenseExpired;
              const inGrace = expired && Math.abs(days) <= (licensePolicy?.grace_period_days || 0);
              if (!expired) return null;
              const canRenew = inGrace;
              const fee = renewalFee
                ? `${renewalFee.amount} ${renewalFee.currency} (paid renewal)`
                : 'Free';
              return (
                <Card>
                  <CardHeader><CardTitle>Renewal</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {expired
                        ? `This license expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago.`
                        : `This license expires in ${days} day${days === 1 ? '' : 's'}.`}
                    </p>
                    <p className="text-sm"><span className="text-muted-foreground">Renewal fee: </span><span className="font-medium">{fee}</span></p>
                    {expired && !inGrace && (
                      <p className="text-xs text-destructive">Grace period has elapsed. Please contact the regulator.</p>
                    )}
                    <Button onClick={startRenewal} disabled={!canRenew || startingRenewal}>
                      {startingRenewal ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                      Renew License
                    </Button>
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          <div>
            <Card>
              <CardHeader><CardTitle className="text-base">Action History</CardTitle></CardHeader>
              <CardContent>
                {actions.length === 0 ? <p className="text-sm text-muted-foreground">No actions recorded</p> : (
                  <div className="space-y-3">
                    {actions.map(a => (
                      <div key={a.id} className="border-l-2 border-border pl-3 py-1">
                        <Badge variant="outline" className="text-xs capitalize mb-1">{a.action_type.replace(/_/g, ' ')}</Badge>
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
