import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveSector } from '@/contexts/ActiveSectorContext';
import { useSectors } from '@/hooks/useMasterConfig';
import { useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';

export default function ChangeActiveSector() {
  const { activeSectorId, setActiveSector } = useActiveSector();
  const { data: sectors = [], isLoading } = useSectors();
  const [selectedId, setSelectedId] = useState(activeSectorId || '');
  const navigate = useNavigate();

  const handleSave = () => {
    if (!selectedId) { toast.error('Please select a sector'); return; }
    const sector = sectors.find(s => s.id === selectedId);
    if (sector) {
      setActiveSector(sector.id, sector.name);
      toast.success(`Active sector changed to ${sector.name}`);
      navigate('/dashboard');
    }
  };

  const activeSectors = sectors.filter(s => s.status === 'active');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Change Active Sector" description="Set your desired sector to work with across the system." />

        <Card className="max-w-lg animate-slide-up delay-100">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Sector Detail Information</CardTitle>
                <CardDescription>Please set your desired sector to work.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Sector</Label>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading sectors...</p>
              ) : (
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger><SelectValue placeholder="Select a sector" /></SelectTrigger>
                  <SelectContent>
                    {activeSectors.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
              <Button onClick={handleSave}>Save Sector</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
