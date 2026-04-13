import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { FormSection } from '@/types/formBuilder';
import type { RegFormSchema } from '@/types/registrationForm';

export interface RegistrationDeclaration {
  label: string;
  required: boolean;
  linkUrl?: string;
  linkLabel?: string;
}

export interface RegistrationDocType {
  label: string;
  required: boolean;
  allowedTypes: string[];
  maxSizeMB: number;
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
  termsUrl: string;
  privacyUrl: string;
  dataProtectionUrl: string;
  declarations: RegistrationDeclaration[];
  documentTypes: RegistrationDocType[];
  formSchema: RegFormSchema;
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
export function useRegistrationConfig(sectorId?: string, subSectorId?: string, categoryId?: string) {
  const [config, setConfig] = useState<RegistrationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('registration_form_configs')
        .select('*')
        .eq('is_active', true);

      const { data: configs } = await query;
      if (!configs || configs.length === 0) {
        setConfig(null);
        setLoading(false);
        return;
      }

      // Score-based matching: most specific match wins
      let best: typeof configs[0] | null = null;
      let bestScore = -1;

      for (const c of configs) {
        let score = 0;
        if (categoryId && c.category_id === categoryId) score = 3;
        else if (subSectorId && c.sub_sector_id === subSectorId && !c.category_id) score = 2;
        else if (sectorId && c.sector_id === sectorId && !c.sub_sector_id && !c.category_id) score = 1;
        else if (!c.sector_id && !c.sub_sector_id && !c.category_id && c.is_default) score = 0;
        else continue;

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
        requireCaptcha: best.require_captcha,
        requireDocuments: best.require_documents,
        termsUrl: best.terms_url || '',
        privacyUrl: best.privacy_url || '',
        dataProtectionUrl: best.data_protection_url || '',
        declarations: (best.declarations as any) || [],
        documentTypes: (best.document_types as any) || [],
        formSchema,
        sections,
      });
    } catch (err) {
      console.error('Failed to load registration config:', err);
      setError('Failed to load registration configuration');
    } finally {
      setLoading(false);
    }
  }, [sectorId, subSectorId, categoryId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return { config, loading, error, reload: loadConfig };
}
