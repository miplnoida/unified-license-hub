import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { Save, CreditCard, DollarSign, Shield, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PaymentSettings() {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Payment Settings"
          description="Configure payment gateways, fees, and transaction rules."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
              <Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>
            </div>
          }
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Payment Gateway</CardTitle>
            <CardDescription>Configure the primary payment processing provider.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Gateway Provider</Label>
              <Select defaultValue="stripe">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="square">Square</SelectItem>
                  <SelectItem value="manual">Manual / Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select defaultValue="sandbox">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox / Test</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" defaultValue="sk_test_••••••••••••" />
            </div>
            <div className="space-y-2">
              <Label>Webhook Secret</Label>
              <Input type="password" defaultValue="whsec_••••••••••••" />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <CardTitle className="text-lg">Fee Structure</CardTitle>
            <CardDescription>
              Fees are managed centrally via the <strong>Fee Management</strong> module under Admin Hub. Changes made there apply automatically across all application and return workflows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
              <DollarSign className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Fee configurations are maintained in <strong>Admin Hub → Fee Management</strong>.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate('/admin/fee-management')}>
                Go to Fee Management
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-300">
          <CardHeader>
            <CardTitle className="text-lg">Payment Policies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {[
              { label: 'Allow Partial Payments', desc: 'Permit users to pay in installments.', on: false },
              { label: 'Auto-Generate Invoices', desc: 'Automatically create invoices on fee assessment.', on: true },
              { label: 'Enable Online Payments', desc: 'Allow payments through the web portal.', on: true },
              { label: 'Send Payment Receipts', desc: 'Email receipt upon successful payment.', on: true },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
                <Switch defaultChecked={item.on} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
