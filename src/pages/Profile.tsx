import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Save, Upload, Shield, Key, Clock } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader title="Profile" description="Manage your personal information and account settings." actions={<Button><Save className="h-4 w-4 mr-2" />Save Changes</Button>} />

        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 mb-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold">
                {user?.fullName.charAt(0)}
              </div>
              <div>
                <h3 className="text-lg font-semibold">{user?.fullName}</h3>
                <Badge variant="secondary" className="capitalize mt-1">{user?.role}</Badge>
                <Button variant="outline" size="sm" className="ml-3"><Upload className="h-4 w-4 mr-1" />Change Photo</Button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2"><Label>Full Name</Label><Input defaultValue={user?.fullName} /></div>
              <div className="space-y-2"><Label>Email Address</Label><Input type="email" defaultValue={user?.email} /></div>
              <div className="space-y-2"><Label>Phone Number</Label><Input defaultValue="+1-555-0123" /></div>
              <div className="space-y-2"><Label>Department</Label><Input defaultValue="Regulatory Affairs" /></div>
              <div className="space-y-2 md:col-span-2"><Label>Bio</Label><Textarea placeholder="Brief description..." /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-200">
          <CardHeader><CardTitle className="text-lg">Security</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-muted-foreground" />
                <div><p className="font-medium">Password</p><p className="text-sm text-muted-foreground">Last changed 30 days ago</p></div>
              </div>
              <Button variant="outline" size="sm">Change Password</Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <div><p className="font-medium">Two-Factor Authentication</p><p className="text-sm text-muted-foreground">Not enabled</p></div>
              </div>
              <Button variant="outline" size="sm">Enable 2FA</Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div><p className="font-medium">Active Sessions</p><p className="text-sm text-muted-foreground">2 active sessions</p></div>
              </div>
              <Button variant="outline" size="sm">Manage</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
