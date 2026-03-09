import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';

interface Props {
  password: string;
  confirmPassword: string;
  onChange: (field: string, value: string) => void;
  errors: Record<string, string>;
}

export function PasswordSection({ password, confirmPassword, onChange, errors }: Props) {
  return (
    <div className="form-section">
      <h3 className="text-lg font-semibold text-foreground">Create Account Password</h3>
      <p className="text-sm text-muted-foreground">
        Set a password so you can log in later to save progress and complete your registration forms.
      </p>

      <div className="grid md:grid-cols-2 gap-6 pt-2">
        <div className="space-y-2">
          <Label htmlFor="password">Password *</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => onChange('password', e.target.value)}
              placeholder="Min. 8 characters"
              className={`pl-10 ${errors.password ? 'border-destructive' : ''}`}
            />
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password *</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={e => onChange('confirmPassword', e.target.value)}
              placeholder="Re-enter password"
              className={`pl-10 ${errors.confirmPassword ? 'border-destructive' : ''}`}
            />
          </div>
          {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
        </div>
      </div>
    </div>
  );
}
