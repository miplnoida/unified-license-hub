import { CaptchaSection } from '@/components/registration/CaptchaSection';
import { EmailVerificationSection } from '@/components/registration/EmailVerificationSection';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RichLabel } from '@/components/shared/RichLabel';
import {
  BEFORE_SUBMISSION_PLACEMENT,
  shouldRenderEmailVerification,
} from '@/lib/registrationEmailVerification';
import type { RegistrationFormData } from '@/hooks/useRegistrationForm';


interface DeclarationConfig {
  label: string;
  required: boolean;
  linkUrl?: string;
  linkLabel?: string;
}

interface Props {
  form: RegistrationFormData;
  errors: Record<string, string>;
  setField: (field: string, value: string | boolean) => void;
  /** Resolved verification email from parent (covers static + dynamic schemas). */
  verificationEmail?: string;
  declarations?: DeclarationConfig[];
  termsUrl?: string;
  privacyUrl?: string;
  dataProtectionUrl?: string;
  requireOtp?: boolean;
  requireCaptcha?: boolean;
  updateMode?: boolean;
}

/** Converts a declaration label into a stable field key */
function declFieldKey(label: string, idx: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return slug || `declaration_${idx}`;
}

function isValidUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function verifiedEmailMarkerKey(email: string): string {
  return `registrationEmailVerified:${email.trim().toLowerCase()}`;
}

export function DeclarationsStep({
  form,
  errors,
  setField,
  verificationEmail,
  declarations,
  termsUrl,
  privacyUrl,
  dataProtectionUrl,
  requireOtp = true,
  requireCaptcha = true,
  updateMode = false,
}: Props) {
  // Build effective declarations: use config if available, else hardcoded fallbacks
  const effectiveDeclarations: DeclarationConfig[] =
    declarations && declarations.length > 0
      ? declarations
      : [
          {
            label: 'I agree to the Terms & Conditions',
            required: true,
            linkLabel: 'Terms & Conditions',
            linkUrl: termsUrl || '/terms',
          },
          {
            label: 'I agree to the Privacy Policy',
            required: true,
            linkLabel: 'Privacy Policy',
            linkUrl: privacyUrl || '/privacy',
          },
          {
            label: 'I agree to the Data Protection Notice',
            required: true,
            linkLabel: 'Data Protection Notice',
            linkUrl: dataProtectionUrl || '/data-protection',
          },
        ];

  const showEmailVerification = shouldRenderEmailVerification({
    stepId: 'declarations',
    stepType: 'declarations',
    placement: emailVerificationPlacement,
    requireOtp,
    updateMode,
  });

  return (
    <div className="space-y-6">
      {/* Email OTP Verification — only when the configured placement is this stage */}
      {showEmailVerification && (
        <EmailVerificationSection form={form} errors={errors} setField={setField} verificationEmail={verificationEmail} />
      )}


      {/* Dynamic Declarations */}
      <div className="form-section">
        <h3 className="text-lg font-semibold text-foreground">Declarations</h3>
        <p className="text-sm text-muted-foreground">
          Please review and accept the following before submitting your registration.
        </p>

        <div className="mt-4 space-y-4">
          {effectiveDeclarations.map((decl, idx) => {
            const fieldKey = declFieldKey(decl.label, idx);
            const validUrl = isValidUrl(decl.linkUrl);
            const links =
              decl.linkLabel && validUrl
                ? [{ text: decl.linkLabel, url: decl.linkUrl as string, newTab: true }]
                : undefined;

            return (
              <div key={idx} className="flex items-start gap-3 rounded-lg border border-border p-4">
                <Checkbox
                  id={`decl-${idx}`}
                  checked={!!(form as unknown as Record<string, unknown>)[fieldKey]}
                  onCheckedChange={(v) => setField(fieldKey, v === true)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor={`decl-${idx}`} className="text-sm cursor-pointer leading-relaxed">
                    <RichLabel label={decl.label} links={links} />
                  </Label>
                  {errors[fieldKey] && (
                    <p className="text-sm text-destructive mt-1">{errors[fieldKey]}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CAPTCHA — real provider only; no checkbox fallback */}
      {requireCaptcha && (
        <CaptchaSection
          verificationId={(form.captchaVerificationId as string | null) ?? null}
          onVerificationChange={(id) => setField('captchaVerificationId', id)}
          error={errors.captcha}
        />
      )}
    </div>
  );
}

