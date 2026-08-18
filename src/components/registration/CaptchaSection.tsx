import { CaptchaWidget } from '@/components/shared/CaptchaWidget';

interface Props {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
}

export function CaptchaSection({ checked, onCheckedChange, error }: Props) {
  return (
    <div className="form-section">
      <h3 className="text-lg font-semibold text-foreground">Security Verification</h3>
      <div className="mt-2">
        <CaptchaWidget verified={checked} onVerifiedChange={onCheckedChange} error={error} />
      </div>
    </div>
  );
}
