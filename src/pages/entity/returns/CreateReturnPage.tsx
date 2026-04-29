import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useReturnConfigs, useReturnTypes, useMutateReturn, useInsertReturnAudit } from '@/hooks/useReturnsManagement';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { addDays, lastDayOfMonth, lastDayOfYear, lastDayOfQuarter, format } from 'date-fns';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const QUARTERS = ['Q1','Q2','Q3','Q4'];

export default function CreateReturnPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isPpoc, mappedLicensees, activeLicenseeId, setActiveLicenseeId } = usePpoc();
  const { data: configs = [] } = useReturnConfigs();
  const { data: returnTypes = [] } = useReturnTypes();
  const { create: createReturn } = useMutateReturn();
  const insertAudit = useInsertReturnAudit();

  // Get user's profile to find entity (for non-PPOC users)
  const { data: profile } = useQuery({
    queryKey: ['my_profile', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('licensee_id, entity_name').eq('id', user!.id).single();
      return data;
    },
  });

  // PPOC users with multiple mapped licensees must pick one explicitly here
  const requiresEntityPick = isPpoc && mappedLicensees.length > 1;
  const [selectedLicenseeId, setSelectedLicenseeId] = useState<string>(
    requiresEntityPick ? '' : (activeLicenseeId || '')
  );
  // Keep local selection in sync if PPOC switches via header
  useEffect(() => {
    if (!requiresEntityPick && activeLicenseeId) {
      setSelectedLicenseeId(activeLicenseeId);
    }
  }, [activeLicenseeId, requiresEntityPick]);

  const [step, setStep] = useState(1);
  const [configId, setConfigId] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [period, setPeriod] = useState('');

  const selectedConfig = configs.find(c => c.id === configId);
  const typeName = selectedConfig?.return_types?.name || '';

  const activeConfigs = configs.filter(c => c.status === 'active');
  const selectedLicenseeName = mappedLicensees.find(l => l.licensee_id === selectedLicenseeId)?.licensee_name;
  // Resolve the entity to file the return for: PPOC-picked, else profile's licensee
  const effectiveLicenseeId = isPpoc ? selectedLicenseeId : (profile?.licensee_id || null);

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

  const handleCreate = () => {
    if (!configId || !period || !year) return;
    if (isPpoc && !selectedLicenseeId) {
      toast.error('Please select a licensee to file the return for.');
      return;
    }
    // Sync the global PPOC active licensee with the chosen entity so downstream
    // pages (fill/view) stay consistent with the user's selection here.
    if (isPpoc && selectedLicenseeId && selectedLicenseeId !== activeLicenseeId) {
      setActiveLicenseeId(selectedLicenseeId);
    }
    const dates = getPeriodDates();
    const dueDate = getDueDate();
    createReturn.mutate({
      entity_id: effectiveLicenseeId,
      ...(isPpoc ? { on_behalf_of_licensee_id: selectedLicenseeId } : {}),
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
      onSuccess: (data: any) => {
        insertAudit.mutate({ return_id: data.id, action: 'created', new_status: 'TEMP', performed_by: user?.id });
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
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-amber-700" />
                      Filing on behalf of (Licensee) *
                    </Label>
                    <Select value={selectedLicenseeId} onValueChange={setSelectedLicenseeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select the licensee to file for" />
                      </SelectTrigger>
                      <SelectContent>
                        {mappedLicensees.map(l => (
                          <SelectItem key={l.licensee_id} value={l.licensee_id}>
                            {l.licensee_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      You are mapped as PPOC for {mappedLicensees.length} licensees. Pick which one this return is for.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Return Configuration *</Label>
                  <Select value={configId} onValueChange={v => { setConfigId(v); setPeriod(''); }}>
                    <SelectTrigger><SelectValue placeholder="Choose a return configuration" /></SelectTrigger>
                    <SelectContent>
                      {activeConfigs.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.return_types?.name || ''} • v{c.version})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedConfig && (
                  <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                    <p><strong>Type:</strong> {selectedConfig.return_types?.name}</p>
                    <p><strong>Sector:</strong> {selectedConfig.sectors?.name || 'All'}</p>
                    <p><strong>Version:</strong> {selectedConfig.version}</p>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    disabled={!configId || (isPpoc && mappedLicensees.length > 1 && !selectedLicenseeId)}
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
                  <p><strong>Return:</strong> {selectedConfig?.name}</p>
                  <p><strong>Type:</strong> {typeName}</p>
                  <p><strong>Period:</strong> {period} {year}</p>
                  <p><strong>Due Date:</strong> {format(getDueDate(), 'MMMM dd, yyyy')}</p>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
                  <Button onClick={handleCreate} disabled={createReturn.isPending}>{createReturn.isPending ? 'Creating...' : 'Create & Start Filing'}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
