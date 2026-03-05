import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useSectors, useSubSectors, useServices } from '@/hooks/useMasterConfig';
import { useForms } from '@/hooks/useForms';

export default function NewPostLicenseApplication() {
  const navigate = useNavigate();
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedSubSector, setSelectedSubSector] = useState('');
  const [selectedService, setSelectedService] = useState('');

  const { data: sectors = [], isLoading: loadingSectors } = useSectors();
  const { data: subSectors = [], isLoading: loadingSubSectors } = useSubSectors();
  const { data: services = [], isLoading: loadingServices } = useServices();
  const { data: forms = [] } = useForms('post_license');

  const activeSectors = sectors.filter(s => s.status === 'active');
  const filteredSubSectors = subSectors.filter(s => s.sector_id === selectedSector && s.status === 'active');
  const filteredServices = services.filter(s => s.sub_sector_id === selectedSubSector && s.status === 'active');

  const selectedServiceObj = services.find(s => s.id === selectedService);

  // Find a published form configured for the selected service
  const matchedForm = useMemo(() => {
    if (!selectedService || !selectedServiceObj) return null;
    return forms.find(f => f.service === selectedServiceObj.name && f.status === 'published') || null;
  }, [selectedService, selectedServiceObj, forms]);

  const handleSectorChange = (val: string) => {
    setSelectedSector(val);
    setSelectedSubSector('');
    setSelectedService('');
  };

  const handleSubSectorChange = (val: string) => {
    setSelectedSubSector(val);
    setSelectedService('');
  };

  const handleProceed = () => {
    if (!selectedSector || !selectedSubSector || !selectedService) {
      toast.error('Please select a Sector, Sub-Sector, and Service to proceed.');
      return;
    }

    if (!matchedForm) {
      toast.error('No published form is configured for this service. Please contact an administrator.');
      return;
    }

    const sectorObj = sectors.find(s => s.id === selectedSector);
    const subSectorObj = subSectors.find(s => s.id === selectedSubSector);

    toast.success('Application created as draft.');

    navigate('/admin/post-licensing', {
      state: {
        newApplication: {
          id: `pla-${Date.now()}`,
          applicationNumber: `PLA-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(3, '0')}`,
          sectorName: sectorObj?.name,
          subSectorName: subSectorObj?.name,
          serviceName: selectedServiceObj?.name,
          formId: matchedForm.id,
          status: 'Draft',
        },
      },
    });
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/post-licensing')}>
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

            {selectedService && !matchedForm && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-destructive">No form configured</p>
                  <p className="text-muted-foreground">
                    There is no published post-license form configured for this service. Please contact an administrator.
                  </p>
                </div>
              </div>
            )}

            {selectedService && matchedForm && (
              <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="text-sm">
                  <p className="font-medium text-primary">Form found</p>
                  <p className="text-muted-foreground">
                    Form: <span className="font-medium">{matchedForm.name}</span>{' '}
                    <Badge variant="approved" className="ml-1">Published</Badge>
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleProceed} disabled={!selectedService || !matchedForm}>
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
