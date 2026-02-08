import { Shield } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface Props {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
}

export function CaptchaSection({ checked, onCheckedChange, error }: Props) {
  return (
    <div className="form-section">
      <h3 className="text-lg font-semibold text-foreground">Security Verification</h3>

      <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4 mt-2">
        <Checkbox
          id="captcha"
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
        />
        <Label htmlFor="captcha" className="text-sm font-normal cursor-pointer">
          I'm not a robot
        </Label>
        <div className="ml-auto flex items-center gap-2 text-muted-foreground">
          <Shield className="h-5 w-5" />
          <span className="text-xs">reCAPTCHA</span>
        </div>
      </div>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      <p className="text-xs text-muted-foreground mt-2">
        This is a placeholder captcha. A real captcha integration will be added in production.
      </p>
    </div>
  );
}
