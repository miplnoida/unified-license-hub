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
import { Badge } from '@/components/ui/badge';
import { Save, CreditCard, DollarSign, Shield } from 'lucide-react';

export default function PaymentSettings() {
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Payment Settings"
          description="Configure payment gateways, fees, and transaction rules."
          actions={<Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>}
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
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'Pre-License Application Fee', amount: '500.00', currency: 'USD' },
                { label: 'Post-License Service Fee', amount: '250.00', currency: 'USD' },
                { label: 'Late Return Penalty (per day)', amount: '50.00', currency: 'USD' },
                { label: 'License Renewal Fee', amount: '350.00', currency: 'USD' },
                { label: 'Certificate Issuance Fee', amount: '100.00', currency: 'USD' },
              ].map(fee => (
                <div key={fee.label} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium text-foreground">{fee.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input type="number" defaultValue={fee.amount} className="w-32 text-right" />
                    <Badge variant="outline">{fee.currency}</Badge>
                  </div>
                </div>
              ))}
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
