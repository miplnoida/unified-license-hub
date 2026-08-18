import { CaptchaWidget } from '@/components/shared/CaptchaWidget';
import { useCaptchaRuntime } from '@/hooks/useCaptchaConfig';

interface Props {
  verificationId: string | null;
  onVerificationChange: (verificationId: string | null) => void;
  error?: string;
}

export function CaptchaSection({ verificationId, onVerificationChange, error }: Props) {
  const { data } = useCaptchaRuntime();
  if (data && !data.enabled && !data.misconfigured) return null;

  return (
    <div className="form-section">
      <h3 className="text-lg font-semibold text-foreground">Security Verification</h3>
      <div className="mt-2">
        <CaptchaWidget
          verificationId={verificationId}
          onVerificationChange={onVerificationChange}
          error={error}
        />
      </div>
    </div>
  );
}
