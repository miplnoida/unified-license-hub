import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, AlertCircle, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useServices } from '@/hooks/useMasterConfig';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useAuth } from '@/contexts/AuthContext';
import { useRegulator } from '@/contexts/RegulatorContext';
import { applicationCreateDraft, getDuplicatePostLicenseRequestId } from '@/lib/applicationGovernedOps';
import { matchPostLicenseTemplates } from '@/lib/postLicenseFormMatch';
import { logAudit } from '@/hooks/useAuditLog';
import { useLicenseStatusGate } from '@/hooks/useLicenseStatusGate';
import { LicenseStatusBanner } from '@/components/shared/LicenseStatusBanner';
import { useLicenseeAccessGuard } from '@/hooks/useLicenseeAccessGuard';
import { usePpoc } from '@/contexts/PpocContext';
import { useLicenseEntitlements, type LicenseEntitlement } from '@/hooks/useLicenseEntitlements';
import { useOpenPostLicenseRequests } from '@/hooks/useOpenPostLicenseRequests';
import { useSearchParams } from 'react-router-dom';
import { canUsePostLicenceServices, pickKeyPersonService } from '@/lib/postLicenceAccess';


/**
 * Post-licence services are entitlements of an EXISTING licence.
 *
 * The taxonomy on this screen is therefore built from the entity's actual
 * approved / issued licences (canonical resolver: useLicenseEntitlements →
 * public.entity_license_entitlements), never from the master sector list.
 * The database re-validates the same rule when the draft is created, so a
 * hand-typed URL or direct API call cannot bypass it.
 */
export default function NewPostLicenseApplication() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeRegulator } = useRegulator();
  const [selectedLicenseId, setSelectedLicenseId] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [creating, setCreating] = useState(false);

  const entitlements = useLicenseEntitlements();
  const { data: services = [], isLoading: loadingServices } = useServices();
  // Forms are owned by the licence's regulator; the header regulator is only a
  // UI preference and must not hide them.
  const selectedLicenseRegulatorId =
    entitlements.eligible.find(l => l.license_id === selectedLicenseId)?.regulator_id
    ?? entitlements.eligible[0]?.regulator_id
    ?? activeRegulator?.id;
  const { data: formTemplates = [] } = useFormTemplates(undefined, selectedLicenseRegulatorId);

  const eligibleLicenses = entitlements.eligible;

  // Auto-select when the entity holds exactly one eligible licence.
  useEffect(() => {
    if (!selectedLicenseId && eligibleLicenses.length === 1) {
      setSelectedLicenseId(eligibleLicenses[0].license_id);
    }
  }, [eligibleLicenses, selectedLicenseId]);

  const selectedLicense: LicenseEntitlement | undefined = useMemo(
    () => eligibleLicenses.find(l => l.license_id === selectedLicenseId),
    [eligibleLicenses, selectedLicenseId],
  );

  // Sector / sub-sector / category are DERIVED from the licence — never chosen.
  const sectorId = selectedLicense?.sector_id || null;
  const subSectorId = selectedLicense?.sub_sector_id || null;
  const categoryId = selectedLicense?.category_id || null;

  const licenseServices = useMemo(() => {
    if (!selectedLicense) return [];
    return services.filter(s => {
      if (s.status !== 'active') return false;
      if (subSectorId) return s.sub_sector_id === subSectorId;
      return s.sector_id === sectorId;
    });
  }, [services, selectedLicense, sectorId, subSectorId]);

  // SERVER AUTHORITY: the applicable form set for a licence + post-licensing
  // service is resolved by post_license_service_form_set(); the client never
  // re-implements form applicability. The heuristics below remain only as a
  // fallback when the server returns no applicable forms for legacy configs.
  const [serverFormSet, setServerFormSet] = useState<any | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!selectedService || !selectedLicense) {
      setServerFormSet(null);
      return;
    }
    (async () => {
      const { data } = await (supabase.rpc as any)('post_license_service_form_set', {
        _service_id: selectedService,
        _license_id: selectedLicense.license_id,
      });
      if (!cancelled) setServerFormSet(data ?? null);
    })();
    return () => { cancelled = true; };
  }, [selectedService, selectedLicense]);

  const matchedTemplates = useMemo(() => {
    if (!selectedService || !selectedLicense) return [];
    const serverForms: any[] = Array.isArray(serverFormSet?.forms) ? serverFormSet.forms : [];
    return matchPostLicenseTemplates({
      templates: formTemplates,
      serverFormIds: serverFormSet?.state === 'OK' ? serverForms.map(f => f.form_id) : null,
      serviceId: selectedService,
      serviceName: services.find(s => s.id === selectedService)?.name ?? null,
      sectorId,
      subSectorId,
    });
  }, [selectedService, selectedLicense, sectorId, subSectorId, formTemplates, services, serverFormSet]);

  const licenseGate = useLicenseStatusGate();
  const accessGuard = useLicenseeAccessGuard();
  const { resolvedLicenseeId, isPpoc } = usePpoc();
  const postLicenceAllowed = canUsePostLicenceServices({
    role: user?.baseRole ?? user?.role, userType: user?.userType, licenseeId: user?.licenseeId, isPpoc,
  });

  // Deep link from My Institution → Key persons: ?license=<id>&service=appoint|resign
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const lic = searchParams.get('license');
    if (lic && !selectedLicenseId && eligibleLicenses.some(l => l.license_id === lic)) setSelectedLicenseId(lic);
  }, [searchParams, eligibleLicenses, selectedLicenseId]);
  useEffect(() => {
    if (selectedService || !licenseServices.length) return;
    const hit = pickKeyPersonService(licenseServices, searchParams.get('service'));
    if (hit) setSelectedService(hit.id);
  }, [searchParams, licenseServices, selectedService]);

  const activeLicenseeId = selectedLicense?.licensee_id || resolvedLicenseeId || null;
  const { data: openRequests = [] } = useOpenPostLicenseRequests(activeLicenseeId);

  const duplicateRequest = useMemo(() => {
    if (!selectedService || !selectedLicense) return undefined;
    return openRequests.find(
      r => r.service_id === selectedService && r.license_id === selectedLicense.license_id,
    );
  }, [openRequests, selectedService, selectedLicense]);

  const handleLicenseChange = (val: string) => {
    setSelectedLicenseId(val);
    setSelectedService('');
  };


  const handleProceed = async () => {
    if (!selectedLicense) {
      toast.error('Select the licence this service applies to.');
      return;
    }
    if (licenseGate.isBlocked) {
      toast.error(licenseGate.blockedReason || 'Your license is not in good standing.');
      return;
    }
    if (!selectedService) {
      toast.error('Please select a service to proceed.');
      return;
    }
    if (matchedTemplates.length === 0) {
      toast.error('No published form is configured for this service.');
      return;
    }
    if (duplicateRequest) {
      toast.error('You already have an open request for this service on this licence.');
      navigate(`/applications/${duplicateRequest.id}`);
      return;
    }
    if (!user) return;


    const licenseeId = selectedLicense.licensee_id || resolvedLicenseeId || null;
    if (licenseeId) {
      const authorized = await accessGuard.verify(licenseeId, sectorId);
      if (!authorized) {
        toast.error('You are not authorized to file post-license applications for this licensee.');
        return;
      }
    }

    setCreating(true);
    const serviceObj = services.find(s => s.id === selectedService);
    const licenseType = [
      selectedLicense.sector_name,
      selectedLicense.sub_sector_name,
      serviceObj?.name,
    ].filter(Boolean).join(' - ');

    try {
      const data = await applicationCreateDraft({
        licenseType,
        regulatorId: selectedLicense.regulator_id || activeRegulator?.id || null,
        data: {
          ...(licenseeId ? { licensee_id: licenseeId } : {}),
          type: 'post_license',
          license_id: selectedLicense.license_id,
          license_number: selectedLicense.license_number,
          sector_id: sectorId,
          sub_sector_id: subSectorId,
          category_id: categoryId,
          service_id: selectedService,
          sector_name: selectedLicense.sector_name,
          sub_sector_name: selectedLicense.sub_sector_name,
          service_name: serviceObj?.name,
          form_template_ids: matchedTemplates.map(t => t.id),
        },
      });

      await logAudit({
        action: 'application_created',
        entityType: 'application',
        entityId: (data as any).id,
        newValue: { license_type: licenseType, type: 'post_license', license_id: selectedLicense.license_id },
      });

      toast.success('Application created as draft.');
      navigate(`/post-licensee/applications/${(data as any).id}/forms?service=${encodeURIComponent(serviceObj?.name || '')}`);
    } catch (err: any) {
      const duplicateId = getDuplicatePostLicenseRequestId(err);
      if (duplicateId !== null) {
        toast.error('You already have an open request for this service on this licence.');
        if (duplicateId) navigate(`/applications/${duplicateId}`);
        return;
      }
      toast.error('Failed to create application: ' + (err.message || 'Unknown error'));

    } finally {
      setCreating(false);
    }
  };

  const noEntitlement = !postLicenceAllowed || (!entitlements.loading && !entitlements.hasEligibleLicense);

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">New Post-License Application</h1>
            <p className="text-muted-foreground">Services available under your issued licences</p>
          </div>
        </div>

        <LicenseStatusBanner />

        {entitlements.loading && (
          <Card><CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your licences…
          </CardContent></Card>
        )}

        {noEntitlement && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Post-licence services are not available yet</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{entitlements.unavailableReason}</p>
              {entitlements.licenses.length > 0 && (
                <div className="space-y-2">
                  {entitlements.licenses.map(l => (
                    <div key={l.license_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <span className="font-medium">{l.license_number || l.license_type} · {l.sector_name || '—'}</span>
                      <Badge variant="outline" className="capitalize">{l.effective_status.replace('_', ' ')}</Badge>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => navigate('/applications')}>View my applications</Button>
                <Button variant="outline" onClick={() => navigate('/licenses')}>View my licences</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!entitlements.loading && entitlements.hasEligibleLicense && (
          <Card>
            <CardHeader>
              <CardTitle>Select Licence & Service</CardTitle>
              <CardDescription>
                Choose the licence this request relates to. The sector and sub-sector are taken from that licence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="licence">Licence *</Label>
                <Select value={selectedLicenseId} onValueChange={handleLicenseChange}>
                  <SelectTrigger id="licence">
                    <SelectValue placeholder="Select licence" />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4} className="z-[9999] max-h-[300px] overflow-y-auto bg-popover">
                    {eligibleLicenses.map(l => (
                      <SelectItem key={l.license_id} value={l.license_id}>
                        {[l.license_number, l.sector_name, l.sub_sector_name].filter(Boolean).join(' · ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedLicense && (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {selectedLicense.license_number || selectedLicense.license_type}
                    {selectedLicense.in_grace_period && <Badge variant="outline">In grace period</Badge>}
                  </div>
                  <p className="text-muted-foreground">
                    Sector: {selectedLicense.sector_name || '—'}
                    {selectedLicense.sub_sector_name ? ` · Sub-sector: ${selectedLicense.sub_sector_name}` : ''}
                    {selectedLicense.category_name ? ` · Category: ${selectedLicense.category_name}` : ''}
                  </p>
                  {selectedLicense.licensee_name && (
                    <p className="text-muted-foreground">Licensee: {selectedLicense.licensee_name}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="service">Service *</Label>
                <Select value={selectedService} onValueChange={setSelectedService} disabled={!selectedLicense}>
                  <SelectTrigger id="service">
                    <SelectValue placeholder={!selectedLicense ? 'Select a licence first' : loadingServices ? 'Loading...' : 'Select Service'} />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4} className="z-[9999] max-h-[300px] overflow-y-auto bg-popover">
                    {licenseServices.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLicense && licenseServices.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No post-licence services are configured for this licence scope yet.
                  </p>
                )}
              </div>

              {selectedService && matchedTemplates.length === 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">No form configured</p>
                    <p className="text-muted-foreground">
                      There is no published post-license form configured for this service.
                    </p>
                  </div>
                </div>
              )}

              {selectedService && matchedTemplates.length > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="text-sm">
                    <p className="font-medium text-primary">{matchedTemplates.length} form(s) found</p>
                    <p className="text-muted-foreground">{matchedTemplates.map(t => t.name).join(', ')}</p>
                  </div>
                </div>
              )}


              {duplicateRequest && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="text-sm space-y-2">
                    <p className="font-medium text-destructive">Request already in progress</p>
                    <p className="text-muted-foreground">
                      An open request for this service already exists on this licence
                      (status: {duplicateRequest.status.replace(/_/g, ' ')}). Continue that request
                      instead of creating a duplicate.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/applications/${duplicateRequest.id}`)}>
                      Open existing request
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={handleProceed}
                  disabled={!selectedLicense || !selectedService || matchedTemplates.length === 0 || creating || licenseGate.isBlocked || !!duplicateRequest}
                >
                  {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Proceed to Application
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>

            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
