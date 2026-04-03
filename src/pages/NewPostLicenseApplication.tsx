import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSectors, useSubSectors, useServices } from '@/hooks/useMasterConfig';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useAuth } from '@/contexts/AuthContext';
import { useRegulator } from '@/contexts/RegulatorContext';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';

export default function NewPostLicenseApplication() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeRegulator } = useRegulator();
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedSubSector, setSelectedSubSector] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: sectors = [], isLoading: loadingSectors } = useSectors();
  const { data: subSectors = [], isLoading: loadingSubSectors } = useSubSectors();
  const { data: services = [], isLoading: loadingServices } = useServices();
  const { data: formTemplates = [] } = useFormTemplates(undefined, activeRegulator?.id);

  const activeSectors = sectors.filter(s => s.status === 'active');
  const filteredSubSectors = subSectors.filter(s => s.sector_id === selectedSector && s.status === 'active');
  const filteredServices = services.filter(s => s.sub_sector_id === selectedSubSector && s.status === 'active');

  // Find ALL matching published form templates for the selected service
  const matchedTemplates = useMemo(() => {
    if (!selectedService) return [];
    const published = formTemplates.filter(t =>
      t.status === 'published' && t.form_type === 'post_license'
    );

    // Priority 1: Match by service_id
    const byService = published.filter(t => t.service_id === selectedService);
    if (byService.length > 0) return byService;

    // Priority 2: Match by sub_sector_id
    const bySubSector = published.filter(t => t.sub_sector_id === selectedSubSector && !t.service_id);
    if (bySubSector.length > 0) return bySubSector;

    // Priority 3: Match by sector_id
    const bySector = published.filter(t => t.sector_id === selectedSector && !t.sub_sector_id && !t.service_id);
    if (bySector.length > 0) return bySector;

    // Priority 4: Fallback to string name matching
    const serviceObj = services.find(s => s.id === selectedService);
    if (serviceObj) {
      const byName = published.filter(t => t.service === serviceObj.name);
      if (byName.length > 0) return byName;
    }

    return [];
  }, [selectedService, selectedSubSector, selectedSector, formTemplates, services]);

  const handleSectorChange = (val: string) => {
    setSelectedSector(val);
    setSelectedSubSector('');
    setSelectedService('');
  };

  const handleSubSectorChange = (val: string) => {
    setSelectedSubSector(val);
    setSelectedService('');
  };

  const handleProceed = async () => {
    if (!selectedSector || !selectedSubSector || !selectedService) {
      toast.error('Please select a Sector, Sub-Sector, and Service to proceed.');
      return;
    }
    if (matchedTemplates.length === 0) {
      toast.error('No published form is configured for this service.');
      return;
    }
    if (!user) return;

    setCreating(true);
    const sectorObj = sectors.find(s => s.id === selectedSector);
    const subSectorObj = subSectors.find(s => s.id === selectedSubSector);
    const serviceObj = services.find(s => s.id === selectedService);
    const licenseType = [sectorObj?.name, subSectorObj?.name, serviceObj?.name].filter(Boolean).join(' - ');

    try {
      const { data, error } = await supabase
        .from('applications')
        .insert({
          applicant_id: user.id,
          license_type: licenseType,
          status: 'draft',
          data: {
            sector_id: selectedSector,
            sub_sector_id: selectedSubSector,
            service_id: selectedService,
            sector_name: sectorObj?.name,
            sub_sector_name: subSectorObj?.name,
            service_name: serviceObj?.name,
            form_template_ids: matchedTemplates.map(t => t.id),
          },
          regulator_id: activeRegulator?.id || null,
        } as any)
        .select()
        .single();

      if (error) throw error;

      await logAudit({
        action: 'application_created',
        entityType: 'application',
        entityId: (data as any).id,
        newValue: { license_type: licenseType, type: 'post_license' },
      });

      toast.success('Application created as draft.');
      navigate(`/post-licensee/applications/${(data as any).id}/forms?service=${encodeURIComponent(serviceObj?.name || '')}`);
    } catch (err: any) {
      toast.error('Failed to create application: ' + (err.message || 'Unknown error'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">New Post-License Application</h1>
            <p className="text-muted-foreground">Select your sector, sub-sector, and service</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Sector & Service</CardTitle>
            <CardDescription>
              Choose the sector, sub-sector, and service for your post-license application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="sector">Sector *</Label>
              <Select value={selectedSector} onValueChange={handleSectorChange}>
                <SelectTrigger id="sector">
                  <SelectValue placeholder={loadingSectors ? 'Loading...' : 'Select Sector'} />
                </SelectTrigger>
                <SelectContent>
                  {activeSectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subsector">Sub-Sector *</Label>
              <Select
                value={selectedSubSector}
                onValueChange={handleSubSectorChange}
                disabled={!selectedSector}
              >
                <SelectTrigger id="subsector">
                  <SelectValue placeholder={!selectedSector ? 'Select a sector first' : loadingSubSectors ? 'Loading...' : 'Select Sub-Sector'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredSubSectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="service">Service *</Label>
              <Select
                value={selectedService}
                onValueChange={setSelectedService}
                disabled={!selectedSubSector}
              >
                <SelectTrigger id="service">
                  <SelectValue placeholder={!selectedSubSector ? 'Select a sub-sector first' : loadingServices ? 'Loading...' : 'Select Service'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <p className="font-medium text-primary">
                    {matchedTemplates.length} form(s) found
                  </p>
                  <p className="text-muted-foreground">
                    {matchedTemplates.map(t => t.name).join(', ')}
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleProceed} disabled={!selectedService || matchedTemplates.length === 0 || creating}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Proceed to Application
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
