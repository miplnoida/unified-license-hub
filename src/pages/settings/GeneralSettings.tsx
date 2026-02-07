import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Save } from 'lucide-react';

export default function GeneralSettings() {
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="General Settings"
          description="Configure global application preferences and system parameters."
          actions={<Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>}
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Organization Details</CardTitle>
            <CardDescription>Basic organization and branding configuration.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <Input defaultValue="AFSC - Authority for Financial Services Commission" />
            </div>
            <div className="space-y-2">
              <Label>Short Name / Acronym</Label>
              <Input defaultValue="AFSC" />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input type="email" defaultValue="info@afsc.gov" />
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input defaultValue="+1-800-555-0100" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address</Label>
              <Textarea defaultValue="123 Regulatory Avenue, Financial District, Capital City" />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <CardTitle className="text-lg">Regional & Format</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select defaultValue="utc-5">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="utc-5">UTC-05:00 (Eastern)</SelectItem>
                  <SelectItem value="utc-6">UTC-06:00 (Central)</SelectItem>
                  <SelectItem value="utc-8">UTC-08:00 (Pacific)</SelectItem>
                  <SelectItem value="utc+0">UTC+00:00 (GMT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date Format</Label>
              <Select defaultValue="mdy">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mdy">MM/DD/YYYY</SelectItem>
                  <SelectItem value="dmy">DD/MM/YYYY</SelectItem>
                  <SelectItem value="ymd">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Language</Label>
              <Select defaultValue="en">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select defaultValue="usd">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD ($)</SelectItem>
                  <SelectItem value="eur">EUR (€)</SelectItem>
                  <SelectItem value="gbp">GBP (£)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-300">
          <CardHeader>
            <CardTitle className="text-lg">System Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {[
              { label: 'Enable Email Notifications', desc: 'Send email alerts for application status changes.', on: true },
              { label: 'Enable SMS Notifications', desc: 'Send SMS alerts for overdue returns.', on: false },
              { label: 'Maintenance Mode', desc: 'Disable public access during system updates.', on: false },
              { label: 'Audit Logging', desc: 'Record all user actions for compliance auditing.', on: true },
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
