import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, ArrowLeft, Globe, CreditCard, FileText, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const integrations = [
  { name: 'Payment Gateway (Stripe)', desc: 'Process payments via Stripe API.', icon: <CreditCard className="h-5 w-5" />, status: 'connected' },
  { name: 'Document Signing (DocuSign)', desc: 'Digital signature for license documents.', icon: <FileText className="h-5 w-5" />, status: 'disconnected' },
  { name: 'Identity Verification (KYC)', desc: 'Verify applicant identity via third-party service.', icon: <Shield className="h-5 w-5" />, status: 'disconnected' },
  { name: 'External Registry API', desc: 'Publish license data to external government registries.', icon: <Globe className="h-5 w-5" />, status: 'disconnected' },
];

export default function IntegrationSettings() {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Integration Settings"
          description="Manage third-party API connections and webhooks."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
              <Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>
            </div>
          }
        />

        <div className="space-y-4">
          {integrations.map((item) => (
            <Card key={item.name} className="animate-slide-up">
              <CardContent className="flex items-center justify-between py-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    {item.icon}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={item.status === 'connected' ? 'default' : 'secondary'}>
                    {item.status === 'connected' ? 'Connected' : 'Not Connected'}
                  </Badge>
                  <Button variant="outline" size="sm">
                    {item.status === 'connected' ? 'Configure' : 'Connect'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
