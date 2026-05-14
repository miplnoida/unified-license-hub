import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, CheckCircle2, XCircle, Loader2, Mail, Phone, User } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RegistrationFormData } from '@/hooks/useRegistrationForm';

interface Props {
  form: RegistrationFormData;
  errors: Record<string, string>;
  setField: (field: string, value: string | boolean) => void;
}

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number', test: (p: string) => /\d/.test(p) },
  { label: 'Special character (!@#$...)', test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
];

export function PrimaryUserStep({ form, errors, setField }: Props) {
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  useEffect(() => {
    const v = form.email.trim().toLowerCase();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setEmailStatus('idle');
      return;
    }
    setEmailStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('check_primary_user_email_exists' as any, { p_email: v });
        if (error) { setEmailStatus('idle'); return; }
        setEmailStatus(data === true ? 'taken' : 'available');
      } catch {
        setEmailStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.email]);

  useEffect(() => {
    if (!form.username.trim() || form.username.trim().length < 3) {
      setUsernameStatus('idle');
      return;
    }
    const timer = setTimeout(async () => {
      setUsernameStatus('checking');
      try {
        const { data } = await supabase
          .from('registrations' as never)
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

  const emailValid = form.email ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) : null;
  const phoneValid = form.telephone ? /^[+]?[\d\s\-()]{7,20}$/.test(form.telephone.trim()) : null;
  const passwordsMatch = form.confirmPassword ? form.password === form.confirmPassword : null;

  const passwordChecks = useMemo(() => {
    if (!form.password) return null;
    return PASSWORD_RULES.map(rule => ({
      ...rule,
      passed: rule.test(form.password),
    }));
  }, [form.password]);

  const allPasswordRulesPassed = passwordChecks?.every(r => r.passed) ?? false;

  return (
    <div className="space-y-6">
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground">Contact Information</h3>
        <p className="text-sm text-muted-foreground">Details of the primary contact person for this application.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pt-2">
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
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {emailStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {emailStatus !== 'checking' && emailValid !== null && (
                  emailValid && emailStatus !== 'taken'
                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                    : <XCircle className="h-4 w-4 text-destructive" />
                )}
              </div>
            </div>
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            {!errors.email && emailStatus === 'taken' && (
              <p className="text-sm text-destructive">This email is already registered</p>
            )}
            {!errors.email && emailStatus === 'available' && (
              <p className="text-sm text-green-600">Email is available</p>
            )}
          </div>
        </div>
      </div>

      {/* Username */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground">Account Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pt-2">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={e => setField('password', e.target.value)}
                placeholder="Create a strong password"
                className={`pl-10 ${errors.password ? 'border-destructive' : ''}`}
              />
              {form.password && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {allPasswordRulesPassed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-amber-500" />}
                </div>
              )}
            </div>
            {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            {/* Password strength indicators */}
            {passwordChecks && (
              <div className="space-y-1 mt-2">
                {passwordChecks.map((rule) => (
                  <div key={rule.label} className="flex items-center gap-1.5 text-xs">
                    {rule.passed ? (
                      <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <span className={rule.passed ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                      {rule.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
