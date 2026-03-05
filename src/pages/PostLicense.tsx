import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Building2, Landmark, TrendingUp, Shield, ArrowRight, FileText,
  FileCheck, ChevronRight, Info,
} from 'lucide-react';

const services = [
  { id: '1', name: 'License Amendment', description: 'Modify terms and conditions of your existing license', icon: <FileText className="h-5 w-5" /> },
  { id: '2', name: 'License Renewal', description: 'Renew your license for the next period', icon: <FileCheck className="h-5 w-5" /> },
  { id: '3', name: 'Branch Addition', description: 'Register a new branch or office location', icon: <Building2 className="h-5 w-5" /> },
  { id: '4', name: 'Name Change', description: 'Update your registered entity name', icon: <FileText className="h-5 w-5" /> },
  { id: '5', name: 'Certificate Reissue', description: 'Request a new copy of your license certificate', icon: <Shield className="h-5 w-5" /> },
  { id: '6', name: 'Shareholder Change', description: 'Report changes in ownership or shareholding', icon: <TrendingUp className="h-5 w-5" /> },
];

export default function PostLicense() {
  const [selectedService, setSelectedService] = useState<string | null>(null);

  const selected = services.find(s => s.id === selectedService);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <PageHeader
          title="Post-License Services"
          description="Apply for amendments, renewals, and other post-license services."
        />

        {/* Service Selection */}
        <div className="animate-slide-up delay-100">
          <h2 className="text-lg font-semibold mb-4">Select a Service</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => (
              <button
                key={service.id}
                onClick={() => setSelectedService(service.id)}
                className={`card-elevated p-5 text-left transition-all ${
                  selectedService === service.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'hover:border-primary/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    selectedService === service.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/10 text-secondary'
                  }`}>
                    {service.icon}
                  </div>
                  {selectedService === service.id && <Badge variant="approved">Selected</Badge>}
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{service.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Service Form */}
        {selected && (
          <Card className="animate-slide-up">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{selected.name}</CardTitle>
                  <CardDescription>{selected.description}</CardDescription>
                </div>
                <Badge variant="draft">New Request</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-info/10 border border-info/20 rounded-lg p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-info">License-Linked Service</p>
                  <p className="text-muted-foreground">This service is linked to your existing license LIC-2024-001. Form fields are dynamically loaded.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2"><Label>License Number</Label><Input value="LIC-2024-001" readOnly className="bg-muted" /></div>
                <div className="space-y-2"><Label>Licensee Name</Label><Input value="John Smith" readOnly className="bg-muted" /></div>
                <div className="space-y-2"><Label>Effective Date</Label><Input type="date" /></div>
                <div className="space-y-2"><Label>Reason for Request</Label>
                  <Select><SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="business">Business Expansion</SelectItem>
                      <SelectItem value="regulatory">Regulatory Requirement</SelectItem>
                      <SelectItem value="restructure">Corporate Restructuring</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline">Save as Draft</Button>
                <Button>Submit Request <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
