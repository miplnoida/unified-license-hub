import { useState } from 'react';
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
import { sectors, subSectors, categories } from '@/data/sectorData';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function NewApplication() {
  const navigate = useNavigate();
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedSubSector, setSelectedSubSector] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const filteredSubSectors = subSectors.filter((s) => s.sectorId === selectedSector);
  const filteredCategories = categories.filter((c) => c.subSectorId === selectedSubSector);

  const handleSectorChange = (val: string) => {
    setSelectedSector(val);
    setSelectedSubSector('');
    setSelectedCategory('');
  };

  const handleSubSectorChange = (val: string) => {
    setSelectedSubSector(val);
    setSelectedCategory('');
  };

  const handleProceed = () => {
    if (!selectedSector || !selectedSubSector || !selectedCategory) {
      toast({
        title: 'Incomplete Selection',
        description: 'Please select a Sector, Sub-Sector, and Category to proceed.',
        variant: 'destructive',
      });
      return;
    }
    // For now navigate to a mock wizard placeholder
    toast({
      title: 'Application Started',
      description: 'Redirecting to the application wizard...',
    });
    navigate('/pre-license');
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/pre-license')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">New License Application</h1>
            <p className="text-muted-foreground">Step 1: Select your licensing category</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Sector & Category</CardTitle>
            <CardDescription>
              Choose the sector, sub-sector, and category for your license application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="sector">Sector *</Label>
              <Select value={selectedSector} onValueChange={handleSectorChange}>
                <SelectTrigger id="sector">
                  <SelectValue placeholder="Select Sector" />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
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
                  <SelectValue placeholder={selectedSector ? 'Select Sub-Sector' : 'Select a sector first'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredSubSectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
                disabled={!selectedSubSector}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder={selectedSubSector ? 'Select Category' : 'Select a sub-sector first'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleProceed} disabled={!selectedCategory}>
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
