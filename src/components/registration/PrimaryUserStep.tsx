import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, CheckCircle2, XCircle, Loader2, Mail, Phone, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RegistrationFormData } from '@/hooks/useRegistrationForm';

interface Props {
  form: RegistrationFormData;
  errors: Record<string, string>;
  setField: (field: string, value: string | boolean) => void;
}

export function PrimaryUserStep({ form, errors, setField }: Props) {
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  // Real-time username availability check
  useEffect(() => {
    if (!form.username.trim() || form.username.trim().length < 3) {
      setUsernameStatus('idle');
      return;
    }
    const timer = setTimeout(async () => {
      setUsernameStatus('checking');
      try {
        const { data } = await supabase
          .from('registrations' as any)
          .select('id')
          .eq('username', form.username.trim())
          .limit(1);
        setUsernameStatus(data && data.length > 0 ? 'taken' : 'available');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.username]);

  // Real-time validation helpers
  const emailValid = form.email ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) : null;
  const phoneValid = form.telephone ? /^[+]?[\d\s\-()]{7,20}$/.test(form.telephone.trim()) : null;
  const passwordStrong = form.password ? form.password.length >= 8 : null;
  const passwordsMatch = form.confirmPassword ? form.password === form.confirmPassword : null;

  return (
    <div className="space-y-6">
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground">Contact Information</h3>
        <p className="text-sm text-muted-foreground">Details of the primary contact person for this application.</p>

        <div className="grid md:grid-cols-2 gap-6 pt-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={form.firstName}
              onChange={e => setField('firstName', e.target.value)}
              placeholder="Enter first name"
              className={errors.firstName ? 'border-destructive' : ''}
            />
            {errors.firstName && <p className="text-sm text-destructive">{errors.firstName}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={form.lastName}
              onChange={e => setField('lastName', e.target.value)}
              placeholder="Enter last name"
              className={errors.lastName ? 'border-destructive' : ''}
            />
            {errors.lastName && <p className="text-sm text-destructive">{errors.lastName}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="telephone">Telephone *</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="telephone"
                type="tel"
                value={form.telephone}
                onChange={e => setField('telephone', e.target.value)}
                placeholder="+1 234 567 8900"
                className={`pl-10 ${errors.telephone ? 'border-destructive' : ''}`}
              />
              {phoneValid !== null && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {phoneValid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              )}
            </div>
            {errors.telephone && <p className="text-sm text-destructive">{errors.telephone}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={e => setField('email', e.target.value)}
                placeholder="name@company.com"
                className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
              />
              {emailValid !== null && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {emailValid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              )}
            </div>
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>
        </div>
      </div>

      {/* Username */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground">Account Details</h3>
        <div className="grid md:grid-cols-2 gap-6 pt-2">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="username"
                value={form.username}
                onChange={e => setField('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="Choose a username (optional)"
                className="pl-10 pr-10"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {usernameStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {usernameStatus === 'taken' && <XCircle className="h-4 w-4 text-destructive" />}
              </div>
            </div>
            {usernameStatus === 'taken' && <p className="text-sm text-destructive">Username is taken</p>}
            {usernameStatus === 'available' && <p className="text-sm text-green-600">Username is available</p>}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={e => setField('password', e.target.value)}
                placeholder="Min. 8 characters"
                className={`pl-10 ${errors.password ? 'border-destructive' : ''}`}
              />
              {passwordStrong !== null && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {passwordStrong ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-amber-500" />}
                </div>
              )}
            </div>
            {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            {passwordStrong === false && <p className="text-xs text-amber-600">At least 8 characters required</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={e => setField('confirmPassword', e.target.value)}
                placeholder="Re-enter password"
                className={`pl-10 ${errors.confirmPassword ? 'border-destructive' : ''}`}
              />
              {passwordsMatch !== null && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {passwordsMatch ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              )}
            </div>
            {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
