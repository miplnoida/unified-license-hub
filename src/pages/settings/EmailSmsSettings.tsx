import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Save, ArrowLeft, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function EmailSmsSettings() {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Email & SMS Settings"
          description="Configure email server and SMS gateway connections."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
              <Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>
            </div>
          }
        />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">SMTP Configuration</CardTitle>
                <CardDescription>Configure the outbound email server.</CardDescription>
              </div>
              <Badge variant="outline" className="text-green-600 border-green-600">Connected</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>SMTP Host</Label>
              <Input defaultValue="smtp.example.com" />
            </div>
            <div className="space-y-2">
              <Label>SMTP Port</Label>
              <Input type="number" defaultValue="587" />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input defaultValue="noreply@afsc.gov" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" defaultValue="••••••••" />
            </div>
            <div className="space-y-2">
              <Label>Encryption</Label>
              <Select defaultValue="tls">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="ssl">SSL</SelectItem>
                  <SelectItem value="tls">TLS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input defaultValue="ARIAS Platform" />
            </div>
            <div className="md:col-span-2">
              <Button variant="outline" size="sm"><Send className="h-4 w-4 mr-2" />Send Test Email</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">SMS Gateway</CardTitle>
                <CardDescription>Configure SMS delivery provider.</CardDescription>
              </div>
              <Badge variant="outline" className="text-muted-foreground">Not Configured</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select defaultValue="twilio">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="vonage">Vonage</SelectItem>
                  <SelectItem value="messagebird">MessageBird</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" placeholder="Enter API key" />
            </div>
            <div className="space-y-2">
              <Label>Sender ID / Phone</Label>
              <Input placeholder="+1-555-0100" />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch />
              <Label>Enable SMS Delivery</Label>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
