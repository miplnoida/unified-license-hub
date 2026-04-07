import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { AlertTriangle, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ChangePassword() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const isForced = !!user?.forcePasswordChange;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    // Clear force_password_change flag
    if (user) {
      await supabase
        .from('profiles')
        .update({ force_password_change: false } as any)
        .eq('id', user.id);
    }

    toast.success('Password updated successfully');
    setSaving(false);
    // Force a page reload so AuthContext re-fetches user data with updated flag
    window.location.href = '/dashboard';
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const content = (
    <div className={isForced ? "min-h-screen flex items-center justify-center bg-muted/40 p-4" : ""}>
      <div className={isForced ? "w-full max-w-lg" : "max-w-lg mt-6"}>
        {!isForced && <PageHeader title="Change Password" />}
        <Card className={isForced ? "mt-0" : "mt-4"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              {isForced ? 'Password Change Required' : 'Update Your Password'}
            </CardTitle>
            <CardDescription>
              {isForced
                ? 'Your password was reset by an administrator. You must set a new password to continue.'
                : 'Choose a new password for your account.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isForced && (
              <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You are using a temporary password. Please set a new password to access the system.
                </AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new">New Password</Label>
                <Input
                  id="new"
                  type="password"
                  placeholder="Enter new password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm New Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // If forced, render without dashboard layout
  if (isForced) return content;

  return <DashboardLayout>{content}</DashboardLayout>;
}
