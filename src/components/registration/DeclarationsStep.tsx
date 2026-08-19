import { CaptchaSection } from '@/components/registration/CaptchaSection';
import { EmailVerificationSection } from '@/components/registration/EmailVerificationSection';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RichLabel } from '@/components/shared/RichLabel';
import {
  BEFORE_SUBMISSION_PLACEMENT,
  shouldRenderEmailVerification,
} from '@/lib/registrationEmailVerification';
import { isItemVisible } from '@/lib/registrationItemVisibility';
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
  /** `false` hides the whole declarations block (verification controls remain). */
  sectionVisible?: boolean;
  termsUrl?: string;
  privacyUrl?: string;
  dataProtectionUrl?: string;
  requireOtp?: boolean;
  requireCaptcha?: boolean;
  /** Admin visibility flags; `false` removes the control from the applicant view. */
  otpVisible?: boolean;
  captchaVisible?: boolean;
  updateMode?: boolean;
  /** Resolved email-verification placement (step id or 'before_submission'). */
  emailVerificationPlacement?: string;

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

export function DeclarationsStep({
  form,
  errors,
  setField,
  verificationEmail,
  declarations,
  sectionVisible = true,
  termsUrl,
  privacyUrl,
  dataProtectionUrl,
  requireOtp = true,
  requireCaptcha = true,
  otpVisible = true,
  captchaVisible = true,
  updateMode = false,
  emailVerificationPlacement = BEFORE_SUBMISSION_PLACEMENT,
}: Props) {

  // Build effective declarations: use config if available, else hardcoded
  // fallbacks. Declarations the admin hid never reach the applicant, but the
  // original index is preserved so the derived field keys stay stable.
  const fallbackDeclarations: DeclarationConfig[] = [
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

  const sourceDeclarations =
    declarations && declarations.length > 0 ? declarations : fallbackDeclarations;

  const effectiveDeclarations = sourceDeclarations
    .map((decl, idx) => ({ decl, idx }))
    .filter(({ decl }) => isItemVisible(decl));



  const showEmailVerification = shouldRenderEmailVerification({
    stepId: 'declarations',
    stepType: 'declarations',
    placement: emailVerificationPlacement,
    requireOtp: requireOtp && otpVisible !== false,
    updateMode,
  });

  return (
    <div className="space-y-6">
      {/* Email OTP Verification — only when the configured placement is this stage */}
      {showEmailVerification && (
        <EmailVerificationSection form={form} errors={errors} setField={setField} verificationEmail={verificationEmail} />
      )}


      {/* Dynamic Declarations — hidden ones are dropped; an empty set hides the block */}
      {effectiveDeclarations.length > 0 && (
        <div className="form-section">
          <h3 className="text-lg font-semibold text-foreground">Declarations</h3>
          <p className="text-sm text-muted-foreground">
            Please review and accept the following before submitting your registration.
          </p>

          <div className="mt-4 space-y-4">
            {effectiveDeclarations.map(({ decl, idx }) => {
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
      )}

      {/* CAPTCHA — real provider only; no checkbox fallback */}
      {requireCaptcha && captchaVisible !== false && (
        <CaptchaSection
          verificationId={(form.captchaVerificationId as string | null) ?? null}
          onVerificationChange={(id) => setField('captchaVerificationId', id)}
          error={errors.captcha}
        />
      )}

    </div>
  );
}

