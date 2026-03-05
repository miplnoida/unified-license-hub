import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ChangePassword() {
  return (
    <DashboardLayout>
      <PageHeader title="Change Password" />
      <div className="max-w-lg mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Update Your Password</CardTitle>
            <CardDescription>Enter your current password and choose a new one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Current Password</Label>
              <Input id="current" type="password" placeholder="Enter current password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New Password</Label>
              <Input id="new" type="password" placeholder="Enter new password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm New Password</Label>
              <Input id="confirm" type="password" placeholder="Confirm new password" />
            </div>
            <Button className="w-full mt-2">Update Password</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
