import { useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, Upload, Shield, Clock, Eye, EyeOff, UserCircle, KeyRound, Loader2, Trash2, Mail } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Personal info ----
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName || '');
    setEmail(user.email || '');
    setPhone((user as any).phone || '');
    setDepartment((user as any).department || '');
    setBio((user as any).bio || '');
    setAvatarUrl((user as any).avatarUrl);
  }, [user]);

  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    setUploadingAvatar(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { cacheControl: '3600', upsert: true });
    if (upErr) { toast.error(upErr.message); setUploadingAvatar(false); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = data.publicUrl;
    const { error: dbErr } = await supabase
      .from('profiles')
      .update({ avatar_url: url } as any)
      .eq('id', user.id);
    if (dbErr) { toast.error(dbErr.message); setUploadingAvatar(false); return; }
    setAvatarUrl(url);
    toast.success('Profile photo updated');
    setUploadingAvatar(false);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone: phone || null,
        department: department || null,
        bio: bio || null,
      } as any)
      .eq('id', user.id);
    setSavingProfile(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Profile updated');
  };

  // ---- Password ----
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) { toast.error('Please fill in all password fields.'); return; }
    if (newPassword.length < 8) { toast.error('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match.'); return; }
    setChanging(true);
    // Verify current password by re-authenticating
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user!.email, password: currentPassword });
    if (signInErr) { toast.error('Current password is incorrect'); setChanging(false); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChanging(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Password updated successfully.');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
  };

  // ---- 2FA (Email OTP) ----
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [loadingTwoFaStatus, setLoadingTwoFaStatus] = useState(true);
  const [twoFaOpen, setTwoFaOpen] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [twoFaMode, setTwoFaMode] = useState<'enable' | 'disable'>('enable');

  const refetchTwoFa = async () => {
    if (!user) return;
    setLoadingTwoFaStatus(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('two_factor_enabled')
      .eq('id', user.id)
      .maybeSingle();
    if (error) console.error('[Profile] 2FA status fetch failed:', error.message);
    setTwoFaEnabled(Boolean((data as any)?.two_factor_enabled));
    setLoadingTwoFaStatus(false);
  };

  useEffect(() => { refetchTwoFa(); }, [user?.id]);

  const sendEmailOtp = async () => {
    if (!user?.email) return;
    setOtpSending(true);
    const { data, error } = await supabase.functions.invoke('send-registration-otp', {
      body: { email: user.email, channel: 'email' },
    });
    setOtpSending(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Failed to send code');
      return;
    }
    setOtpSent(true);
    toast.success(`Verification code sent to ${user.email}`);
  };

  const beginEnable2FA = async () => {
    setTwoFaMode('enable');
    setOtpCode(''); setOtpSent(false);
    setTwoFaOpen(true);
    await sendEmailOtp();
  };

  const beginDisable2FA = async () => {
    setTwoFaMode('disable');
    setOtpCode(''); setOtpSent(false);
    setTwoFaOpen(true);
    await sendEmailOtp();
  };

  const verifyOtpAndToggle = async () => {
    if (!user?.email || otpCode.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setOtpVerifying(true);
    const { data, error } = await supabase.functions.invoke('verify-registration-otp', {
      body: { email: user.email, code: otpCode, channel: 'email' },
    });
    if (error || !(data as any)?.verified) {
      toast.error((data as any)?.error || error?.message || 'Invalid code');
      setOtpVerifying(false); return;
    }
    const enable = twoFaMode === 'enable';
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ two_factor_enabled: enable } as any)
      .eq('id', user.id);
    setOtpVerifying(false);
    if (upErr) { toast.error(upErr.message); return; }
    await refetchTwoFa();
    setTwoFaOpen(false);
    toast.success(enable ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled');
  };

  // ---- Sessions ----
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [currentSessionInfo, setCurrentSessionInfo] = useState<{ created: string; expires: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setCurrentSessionInfo({
          created: new Date((data.session.user.last_sign_in_at || data.session.user.created_at) as string).toLocaleString(),
          expires: new Date((data.session.expires_at ?? 0) * 1000).toLocaleString(),
        });
      }
    });
  }, []);

  const handleSignOutAll = async () => {
    setSigningOutAll(true);
    const { error } = await supabase.auth.signOut({ scope: 'others' as any });
    setSigningOutAll(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Signed out of all other sessions');
    setSessionsOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader title="Profile" description="Manage your account information and security settings." />

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
            <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2">
              <UserCircle className="h-4 w-4 mr-2" />Profile Details
            </TabsTrigger>
            <TabsTrigger value="password" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2">
              <KeyRound className="h-4 w-4 mr-2" />Change Password
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Personal Information</CardTitle>
                <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile}>
                  {savingProfile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Changes
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 mb-8">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold overflow-hidden">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      user?.fullName.charAt(0)
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{user?.fullName}</h3>
                    <Badge variant="secondary" className="capitalize mt-1">{user?.role}</Badge>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    <Button variant="outline" size="sm" className="ml-3" onClick={handleAvatarPick} disabled={uploadingAvatar}>
                      {uploadingAvatar ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                      Change Photo
                    </Button>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label>Full Name</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Email Address</Label><Input type="email" value={email} disabled /></div>
                  <div className="space-y-2"><Label>Phone Number</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Department</Label><Input value={department} onChange={e => setDepartment(e.target.value)} /></div>
                  <div className="space-y-2 md:col-span-2"><Label>Bio</Label><Textarea placeholder="Brief description..." value={bio} onChange={e => setBio(e.target.value)} /></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Security</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-muted-foreground">
                        {loadingTwoFaStatus ? 'Loading…' : twoFaEnabled ? `Enabled — codes sent to ${user?.email}` : 'Not enabled'}
                      </p>
                    </div>
                  </div>
                  {loadingTwoFaStatus ? (
                    <Button variant="outline" size="sm" disabled><Loader2 className="h-4 w-4 animate-spin" /></Button>
                  ) : twoFaEnabled ? (
                    <Button variant="outline" size="sm" onClick={beginDisable2FA}><Trash2 className="h-4 w-4 mr-1" />Disable</Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={beginEnable2FA}><Mail className="h-4 w-4 mr-1" />Enable 2FA</Button>
                  )}
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div><p className="font-medium">Active Sessions</p><p className="text-sm text-muted-foreground">Manage devices signed in to your account</p></div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSessionsOpen(true)}>Manage</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="password" className="mt-6">
            <Card className="max-w-lg">
              <CardHeader>
                <CardTitle className="text-lg">Change Password</CardTitle>
                <CardDescription>Update your password to keep your account secure.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="current-pw">Current Password</Label>
                  <div className="relative">
                    <Input id="current-pw" type={showCurrent ? 'text' : 'password'} placeholder="Enter current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="pr-10" />
                    <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-pw">New Password</Label>
                  <div className="relative">
                    <Input id="new-pw" type={showNew ? 'text' : 'password'} placeholder="Min. 8 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="pr-10" />
                    <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-pw">Confirm New Password</Label>
                  <div className="relative">
                    <Input id="confirm-pw" type={showConfirm ? 'text' : 'password'} placeholder="Re-enter new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="pr-10" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={handleChangePassword} disabled={changing} className="w-full mt-2">
                  {changing ? 'Updating…' : 'Update Password'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* 2FA Email OTP Dialog */}
      <Dialog open={twoFaOpen} onOpenChange={(o) => { if (!otpVerifying && !otpSending) setTwoFaOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{twoFaMode === 'enable' ? 'Enable' : 'Disable'} Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              We've sent a 6-digit verification code to <strong>{user?.email}</strong>. Enter it below to confirm.
            </DialogDescription>
          </DialogHeader>
          {otpSending && !otpSent ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-otp">Verification Code</Label>
                <Input id="email-otp" inputMode="numeric" maxLength={6} placeholder="123456" autoFocus value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={sendEmailOtp} disabled={otpSending} className="w-full">
                {otpSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Resend code
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTwoFaOpen(false)} disabled={otpVerifying || otpSending}>Cancel</Button>
            <Button onClick={verifyOtpAndToggle} disabled={otpVerifying || otpCode.length !== 6}>
              {otpVerifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{twoFaMode === 'enable' ? 'Verify & Enable' : 'Verify & Disable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sessions Dialog */}
      <Dialog open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Active Sessions</DialogTitle>
            <DialogDescription>Manage where you're signed in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-4 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Current Session</p>
                  <p className="text-xs text-muted-foreground">This device</p>
                </div>
                <Badge>Active</Badge>
              </div>
              {currentSessionInfo && (
                <div className="mt-3 text-xs text-muted-foreground space-y-1">
                  <div>Signed in: {currentSessionInfo.created}</div>
                  <div>Expires: {currentSessionInfo.expires}</div>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              For security, you can sign out of all other devices currently signed in to your account.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSessionsOpen(false)}>Close</Button>
            <Button variant="destructive" onClick={handleSignOutAll} disabled={signingOutAll}>
              {signingOutAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Sign out of all other sessions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
