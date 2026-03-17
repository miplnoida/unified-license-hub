import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function NotificationSettings() {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Notification Settings"
          description="Configure notification channels, templates, and delivery preferences."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
              <Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>
            </div>
          }
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Email Notifications</CardTitle>
            <CardDescription>Configure which events trigger email notifications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Application Status Changes', desc: 'Notify applicants when their application status changes.', on: true },
              { label: 'License Expiry Warnings', desc: 'Send reminders before license expiration.', on: true },
              { label: 'Return Due Reminders', desc: 'Alert licensees about upcoming compliance returns.', on: true },
              { label: 'Payment Confirmations', desc: 'Send receipts after successful payments.', on: true },
              { label: 'New Complaint Filed', desc: 'Notify investigators when a complaint is assigned.', on: false },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
                <Switch defaultChecked={item.on} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <CardTitle className="text-lg">Notification Timing</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>License Expiry Warning (days before)</Label>
              <Input type="number" defaultValue="30" />
            </div>
            <div className="space-y-2">
              <Label>Return Due Reminder (days before)</Label>
              <Input type="number" defaultValue="7" />
            </div>
            <div className="space-y-2">
              <Label>Digest Frequency</Label>
              <Select defaultValue="daily">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="realtime">Real-time</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily Digest</SelectItem>
                  <SelectItem value="weekly">Weekly Digest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quiet Hours</Label>
              <div className="flex gap-2 items-center">
                <Input type="time" defaultValue="22:00" className="flex-1" />
                <span className="text-muted-foreground">to</span>
                <Input type="time" defaultValue="07:00" className="flex-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
