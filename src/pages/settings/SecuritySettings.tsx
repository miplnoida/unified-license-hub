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

export default function SecuritySettings() {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Security Settings"
          description="Configure password policies, session management, and access controls."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
              <Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>
            </div>
          }
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Password Policy</CardTitle>
            <CardDescription>Set minimum requirements for user passwords.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Minimum Password Length</Label>
              <Input type="number" defaultValue="8" />
            </div>
            <div className="space-y-2">
              <Label>Password Expiry (days)</Label>
              <Input type="number" defaultValue="90" />
            </div>
            <div className="space-y-2">
              <Label>Max Failed Login Attempts</Label>
              <Input type="number" defaultValue="5" />
            </div>
            <div className="space-y-2">
              <Label>Lockout Duration (minutes)</Label>
              <Input type="number" defaultValue="30" />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <CardTitle className="text-lg">Session Management</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Session Timeout (minutes)</Label>
              <Input type="number" defaultValue="30" />
            </div>
            <div className="space-y-2">
              <Label>Max Concurrent Sessions</Label>
              <Select defaultValue="3">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="unlimited">Unlimited</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-300">
          <CardHeader>
            <CardTitle className="text-lg">Security Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Require Uppercase Letters', desc: 'Passwords must contain at least one uppercase letter.', on: true },
              { label: 'Require Special Characters', desc: 'Passwords must contain at least one special character.', on: true },
              { label: 'Enforce Two-Factor Authentication', desc: 'Require 2FA for all admin users.', on: false },
              { label: 'IP Whitelisting', desc: 'Restrict admin access to approved IP addresses.', on: false },
              { label: 'Login Activity Logging', desc: 'Log all login attempts for audit purposes.', on: true },
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
      </div>
    </DashboardLayout>
  );
}
