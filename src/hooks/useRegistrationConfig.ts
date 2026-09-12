import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { FormSection } from '@/types/formBuilder';
import type { RegFormSchema } from '@/types/registrationForm';

export interface RegistrationDeclaration {
  label: string;
  required: boolean;
  linkUrl?: string;
  linkLabel?: string;
  /** Admin-controlled visibility. `undefined`/`true` = shown to the applicant. */
  visible?: boolean;
}

export interface RegistrationDocType {
  label: string;
  required: boolean;
  allowedTypes: string[];
  maxSizeMB: number;
  /** Admin-controlled visibility. `undefined`/`true` = shown to the applicant. */
  visible?: boolean;
}

export interface RegistrationConfig {
  id: string;
  name: string;
  sectorId: string | null;
  subSectorId: string | null;
  categoryId: string | null;
  isDefault: boolean;
  requireOtp: boolean;
  requireCaptcha: boolean;
  requireDocuments: boolean;
  /** Whether the email OTP block is shown to the applicant. */
  otpVisible: boolean;
  /** Whether the CAPTCHA block is shown to the applicant. */
  captchaVisible: boolean;
  /** Whether the whole Supporting Documents section is shown to the applicant. */
  documentsSectionVisible: boolean;
  /** Whether the whole Declarations section is shown to the applicant. */
  declarationsSectionVisible: boolean;

  termsUrl: string;
  privacyUrl: string;
  dataProtectionUrl: string;
  declarations: RegistrationDeclaration[];
  documentTypes: RegistrationDocType[];
  formSchema: RegFormSchema;
  /** Stable registration step id (or 'before_submission') where email OTP is shown. */
  emailVerificationStepId: string | null;
  // Legacy compat: convert form_schema steps into FormSection[]
  sections: FormSection[];
}


/**
 * Convert inline form_schema steps into FormSection[] for backwards compat
 */
function schemaToSections(schema: RegFormSchema): FormSection[] {
  return schema.map((step, idx) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    sortOrder: idx,
    isRepeatable: false,
    fields: step.rows.flatMap((row, rIdx) =>
      row.columns
        .filter(col => col.field)
        .map((col, fIdx) => ({
          id: col.field!.id,
          fieldName: col.field!.fieldName,
          label: col.field!.label,
          type: col.field!.type as any,
          required: col.field!.required,
          placeholder: col.field!.placeholder,
          helpText: col.field!.helpText,
          defaultValue: col.field!.defaultValue,
          options: col.field!.options as any,
          validation: col.field!.validation as any,
        }))
    ),
  }));
}

/**
 * Fetches the registration form config matching the given sector/category,
 * falling back to the default config.
 */
export function useRegistrationConfig(sectorId?: string, subSectorId?: string, categoryId?: string, enabled = true) {
  const [config, setConfig] = useState<RegistrationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!enabled) {
      setLoading(true);
      return;
    }
    // Only show full-page loading on initial load. Subsequent reloads
    // (e.g. when sector/sub-sector/category changes) happen silently to
    // avoid flickering the entire registration page.
    setLoading(prev => (hasLoadedOnce ? false : true));
    setError(null);
    try {
      const query = supabase
        .from('registration_form_configs')
        .select('*')
        .eq('is_active', true);

      const { data: configs, error: queryError } = await query;
      if (queryError) {
        console.error('Failed to fetch registration configs:', queryError);
        setError(queryError.message);
        setConfig(null);
        setLoading(false);
        return;
      }
      if (!configs || configs.length === 0) {
        setConfig(null);
        setLoading(false);
        return;
      }

      // Score-based matching: most specific match wins.
      // A config can only match if every taxonomy constraint it sets is satisfied
      // by the requested taxonomy (a config that pins category=X cannot match a
      // request without that category). Higher specificity beats lower.
      let best: typeof configs[0] | null = null;
      let bestScore = -1;

      for (const c of configs) {
        // Reject if config requires a taxonomy that doesn't match the request
        if (c.category_id && c.category_id !== categoryId) continue;
        if (c.sub_sector_id && c.sub_sector_id !== subSectorId) continue;
        if (c.sector_id && c.sector_id !== sectorId) continue;

        let score = 0;
        if (c.category_id) score = 3;
        else if (c.sub_sector_id) score = 2;
        else if (c.sector_id) score = 1;
        else if (c.is_default) score = 0;
        else score = -0.5; // catch-all (no taxonomy, not default) — last resort

        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }

      if (!best) {
        best = configs.find(c => c.is_default) || configs[0];
      }

      const formSchema: RegFormSchema = (best.form_schema as any) || [];
      const sections = schemaToSections(formSchema);

      setConfig({
        id: best.id,
        name: best.name,
        sectorId: best.sector_id,
        subSectorId: best.sub_sector_id,
        categoryId: best.category_id,
        isDefault: best.is_default,
        requireOtp: best.require_otp,
        otpVisible: (best as { otp_visible_to_applicant?: boolean | null }).otp_visible_to_applicant !== false,
        captchaVisible: (best as { captcha_visible_to_applicant?: boolean | null }).captcha_visible_to_applicant !== false,
        documentsSectionVisible: (best as { documents_section_visible?: boolean | null }).documents_section_visible !== false,
        declarationsSectionVisible: (best as { declarations_section_visible?: boolean | null }).declarations_section_visible !== false,


        requireCaptcha: best.require_captcha,
        requireDocuments: best.require_documents,
        termsUrl: best.terms_url || '',
        privacyUrl: best.privacy_url || '',
        dataProtectionUrl: best.data_protection_url || '',
        declarations: (best.declarations as any) || [],
        documentTypes: (best.document_types as any) || [],
        emailVerificationStepId: (best as { email_verification_step_id?: string | null }).email_verification_step_id ?? null,
        formSchema,
        sections,
      });
    } catch (err) {
      console.error('Failed to load registration config:', err);
      setError('Failed to load registration configuration');
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, [sectorId, subSectorId, categoryId, hasLoadedOnce, enabled]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return { config, loading, error, reload: loadConfig };
}
