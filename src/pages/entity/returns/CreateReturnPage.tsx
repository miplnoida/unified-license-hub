import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useReturnConfigs, useReturnTypes, useMutateReturn } from '@/hooks/useReturnsManagement';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { addDays, lastDayOfMonth, lastDayOfYear, lastDayOfQuarter, format } from 'date-fns';
import { useLicenseStatusGate } from '@/hooks/useLicenseStatusGate';
import { LicenseStatusBanner } from '@/components/shared/LicenseStatusBanner';
import { useLicenseeAccessGuard } from '@/hooks/useLicenseeAccessGuard';
import { logReturnCreated } from '@/lib/returnActivityLogger';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const QUARTERS = ['Q1','Q2','Q3','Q4'];

export default function CreateReturnPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isPpoc, mappedLicensees, activeLicenseeId, actingAs, ownLicenseeId } = usePpoc();
  const { data: configs = [] } = useReturnConfigs();
  const { data: returnTypes = [] } = useReturnTypes();
  const { create: createReturn } = useMutateReturn();

  // Get user's profile to find entity (for non-PPOC users)
  const { data: profile } = useQuery({
    queryKey: ['my_profile', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('licensee_id, entity_name').eq('id', user!.id).single();
      return data;
    },
  });

  // The header LicenseeSwitcher decides the operating context. When the
  // selection is the user's own entity, we file as Primary User (no
  // "on_behalf_of"); when it's a mapped entity, we file as PPOC.
  const isActingAsPpoc = actingAs === 'ppoc';
  const selectedLicenseeId = activeLicenseeId || '';

  const [step, setStep] = useState(1);
  const [configId, setConfigId] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [period, setPeriod] = useState('');

  const selectedConfig = configs.find(c => c.id === configId);
  const typeName = selectedConfig?.return_types?.name || '';

  const activeConfigs = configs.filter(c => c.status === 'active');
  const selectedLicenseeName = mappedLicensees.find(l => l.licensee_id === selectedLicenseeId)?.licensee_name;
  // Resolve the entity to file the return for:
  //   - acting as PPOC → the mapped licensee
  //   - acting as Primary User → own licensee (selection or profile fallback)
  const effectiveLicenseeId = isActingAsPpoc
    ? selectedLicenseeId
    : (selectedLicenseeId || ownLicenseeId || profile?.licensee_id || null);

  const periodOptions = useMemo(() => {
    if (typeName === 'Annual') return ['Annual'];
    if (typeName === 'Quarterly') return QUARTERS;
    if (typeName === 'Monthly') return MONTHS;
    return ['Annual'];
  }, [typeName]);

  const getDueDate = () => {
    const y = parseInt(year);
    let periodEnd: Date;
    if (typeName === 'Annual') periodEnd = lastDayOfYear(new Date(y, 0));
    else if (typeName === 'Quarterly') {
      const qi = QUARTERS.indexOf(period);
      periodEnd = lastDayOfQuarter(new Date(y, qi * 3));
    } else {
      const mi = MONTHS.indexOf(period);
      periodEnd = lastDayOfMonth(new Date(y, mi));
    }
    return addDays(periodEnd!, 30); // default 30 days cutoff
  };

  const getPeriodDates = () => {
    const y = parseInt(year);
    if (typeName === 'Annual') return { start: `${y}-01-01`, end: `${y}-12-31` };
    if (typeName === 'Quarterly') {
      const qi = QUARTERS.indexOf(period);
      const startMonth = qi * 3;
      return { start: format(new Date(y, startMonth, 1), 'yyyy-MM-dd'), end: format(lastDayOfQuarter(new Date(y, startMonth)), 'yyyy-MM-dd') };
    }
    const mi = MONTHS.indexOf(period);
    return { start: format(new Date(y, mi, 1), 'yyyy-MM-dd'), end: format(lastDayOfMonth(new Date(y, mi)), 'yyyy-MM-dd') };
  };

  const licenseGate = useLicenseStatusGate();
  const accessGuard = useLicenseeAccessGuard();

  const handleCreate = async () => {
    if (licenseGate.isBlocked) {
      toast.error(licenseGate.blockedReason || 'Your license is not in good standing.');
      return;
    }
    if (!configId || !period || !year) return;
    if (isPpoc && !selectedLicenseeId) {
      toast.error('Please select a licensee to file the return for.');
      return;
    }
    if (!effectiveLicenseeId) {
      toast.error('No licensee context found. Please select a licensee or contact your administrator.');
      return;
    }
    // Server-verified authorization: confirm the current user is Primary or
    // an active PPOC for this licensee/sector before any write attempt.
    const authorized = await accessGuard.verify(
      effectiveLicenseeId,
      selectedConfig?.sector_id || null,
    );
    if (!authorized) {
      toast.error('You are not authorized to file returns for this licensee.');
      return;
    }
    const dates = getPeriodDates();
    const dueDate = getDueDate();

    // Pre-check: a return already exists for this entity/config/year/period.
    // The DB has a unique constraint on (entity_id, return_configuration_id, return_year, return_period);
    // resume the existing draft (or notify) instead of surfacing the raw error.
    try {
      const { data: existing } = await (supabase as any)
        .from('returns_filed')
        .select('id, workflow_status')
        .eq('entity_id', effectiveLicenseeId)
        .eq('return_configuration_id', configId)
        .eq('return_year', parseInt(year))
        .eq('return_period', period)
        .maybeSingle();
      if (existing?.id) {
        const status = (existing.workflow_status || '').toString().toUpperCase();
        const isOpen = ['TEMP', 'WIP', 'TBR', 'DRAFT', 'RETURNED', 'REJECTED'].includes(status);
        if (isOpen) {
          toast.info('A return already exists for this period. Resuming the existing draft.');
          navigate(`/entity/returns/${existing.id}/fill`);
        } else {
          toast.error('A return for this period has already been submitted for this entity.');
        }
        return;
      }
    } catch (_) { /* fall through to insert; mutation will handle errors */ }

    createReturn.mutate({
      entity_id: effectiveLicenseeId,
      ...(isActingAsPpoc ? { on_behalf_of_licensee_id: selectedLicenseeId } : {}),
      return_configuration_id: configId,
      sector_id: selectedConfig?.sector_id || null,
      subsector_id: selectedConfig?.subsector_id || null,
      return_year: parseInt(year),
      return_period: period,
      period_start_date: dates.start,
      period_end_date: dates.end,
      due_date: format(dueDate, 'yyyy-MM-dd'),
      workflow_status: 'TEMP',
      created_by: user?.id,
      updated_by: user?.id,
    } as any, {
      onSuccess: async (data: any) => {
        await logReturnCreated({
          return_id: data.id,
          new_status: 'TEMP',
          performed_by: user?.id,
          return_configuration_id: configId,
          return_config_name: selectedConfig?.name || null,
        });
        toast.success('Return created! Start filling the form.');
        navigate(`/entity/returns/${data.id}/fill`);
      },
    });
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Create New Return" description="Select return configuration and filing period" />

        <div className="max-w-2xl mx-auto"><LicenseStatusBanner /></div>

        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-6">
            {/* Steps indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {[1, 2, 3].map(s => (
                <div key={s} className={`flex items-center gap-2 ${s <= step ? 'text-primary' : 'text-muted-foreground'}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${s < step ? 'bg-primary text-primary-foreground' : s === step ? 'border-2 border-primary' : 'border-2 border-muted'}`}>
                    {s < step ? <CheckCircle className="h-4 w-4" /> : s}
                  </div>
                  {s < 3 && <div className={`w-12 h-0.5 ${s < step ? 'bg-primary' : 'bg-muted'}`} />}
                </div>
              ))}
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Select Return Configuration</h3>

                {isPpoc && mappedLicensees.length > 1 && (
                  selectedLicenseeId ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
                      <Building2 className="h-4 w-4 text-amber-700" />
                      <span>
                        Filing as PPOC on behalf of <strong>{selectedLicenseeName}</strong>.
                        {' '}Use the licensee switcher in the header to change.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
                      <Building2 className="h-4 w-4" />
                      <span>Select a licensee from the header switcher to file a return.</span>
                    </div>
                  )
                )}

                {isPpoc && mappedLicensees.length === 1 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
                    <Building2 className="h-4 w-4 text-amber-700" />
                    <span>Filing as PPOC on behalf of <strong>{mappedLicensees[0].licensee_name}</strong>.</span>
                  </div>
                )}

                {activeConfigs.length === 0 ? (
                  <div className="p-4 border border-amber-300 bg-amber-50 rounded-lg text-sm text-amber-900">
                    <p className="font-medium">No return form is currently configured.</p>
                    <p className="mt-1 text-amber-800">
                      An admin must configure a return form (Sector, Sub-Sector and Return Type) from
                      <strong> Admin → Form Management → Returns </strong> and link it to a return configuration before you can file a return.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Return Configuration *</Label>
                      <Select value={configId} onValueChange={v => { setConfigId(v); setPeriod(''); }}>
                        <SelectTrigger><SelectValue placeholder="Choose a return configuration" /></SelectTrigger>
                        <SelectContent>
                          {activeConfigs.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} ({c.return_types?.name || 'Untyped'})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedConfig && (
                      <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                        <p><strong>Return Type:</strong> {selectedConfig.return_types?.name || '—'}</p>
                        <p><strong>Sector:</strong> {selectedConfig.sectors?.name || 'All'}</p>
                        <p><strong>Sub-Sector:</strong> {(selectedConfig as any).sub_sectors?.name || 'All'}</p>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-end">
                  <Button
                    disabled={
                      activeConfigs.length === 0 ||
                      !configId ||
                      (isPpoc && mappedLicensees.length > 1 && !selectedLicenseeId)
                    }
                    onClick={() => setStep(2)}
                  >
                    Next <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Select Period</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Year *</Label>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Period *</Label>
                    <Select value={period} onValueChange={setPeriod}>
                      <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                      <SelectContent>{periodOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
                  <Button disabled={!period} onClick={() => setStep(3)}>Next <ArrowRight className="h-4 w-4 ml-2" /></Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Confirmation</h3>
                <div className="p-4 bg-muted/50 rounded-lg space-y-2 text-sm">
                  {isPpoc && selectedLicenseeName && (
                    <p><strong>Licensee:</strong> {selectedLicenseeName}</p>
                  )}
                  <p><strong>Return:</strong> {selectedConfig?.name}</p>
                  <p><strong>Type:</strong> {typeName}</p>
                  <p><strong>Period:</strong> {period} {year}</p>
                  <p><strong>Due Date:</strong> {format(getDueDate(), 'MMMM dd, yyyy')}</p>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
                  <Button onClick={handleCreate} disabled={createReturn.isPending || licenseGate.isBlocked}>{createReturn.isPending ? 'Creating...' : licenseGate.isBlocked ? 'License Not Active' : 'Create & Start Filing'}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
