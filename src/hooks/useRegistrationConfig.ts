import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { FormSection } from '@/types/formBuilder';

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
  formTemplateId: string | null;
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
  sections: FormSection[];
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
      // Try to find a specific config for the category first, then sub-sector, then sector, then default
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
        if (c.is_default) score = 0; // fallback
        if (categoryId && c.category_id === categoryId) score = 3;
        else if (subSectorId && c.sub_sector_id === subSectorId && !c.category_id) score = 2;
        else if (sectorId && c.sector_id === sectorId && !c.sub_sector_id && !c.category_id) score = 1;
        else if (!c.sector_id && !c.sub_sector_id && !c.category_id && c.is_default) score = 0;
        else continue; // no match

        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }

      // If no specific match, use default
      if (!best) {
        best = configs.find(c => c.is_default) || configs[0];
      }

      // Load form template sections if linked
      let sections: FormSection[] = [];
      if (best.form_template_id) {
        const { data: version } = await supabase
          .from('form_versions')
          .select('id, schema_snapshot')
          .eq('template_id', best.form_template_id)
          .eq('status', 'published')
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (version) {
          const snapshot = version.schema_snapshot as any;
          if (Array.isArray(snapshot) && snapshot.length > 0) {
            sections = snapshot as FormSection[];
          } else {
            // Fallback: build from form_fields
            const { data: fields } = await supabase
              .from('form_fields')
              .select('*')
              .eq('version_id', version.id)
              .order('section_order', { ascending: true })
              .order('sort_order', { ascending: true });

            if (fields && fields.length > 0) {
              const sectionMap = new Map<string, FormSection>();
              for (const f of fields) {
                if (!sectionMap.has(f.section_id)) {
                  sectionMap.set(f.section_id, {
                    id: f.section_id,
                    title: f.section_title,
                    description: f.section_description || undefined,
                    isRepeatable: f.section_is_repeatable || false,
                    sortOrder: f.section_order,
                    fields: [],
                  });
                }
                const sec = sectionMap.get(f.section_id)!;
                sec.fields.push({
                  id: f.id,
                  fieldName: f.field_name,
                  label: f.label,
                  type: f.field_type as any,
                  required: f.required,
                  placeholder: f.placeholder || undefined,
                  helpText: f.help_text || undefined,
                  defaultValue: f.default_value || undefined,
                  options: f.options as any,
                  validation: f.validation as any,
                  calculatedExpression: f.calculated_expression || undefined,
                  content: f.content || undefined,
                  tableColumns: f.table_columns as any,
                });
              }
              sections = Array.from(sectionMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
            }
          }
        }
      }

      setConfig({
        id: best.id,
        name: best.name,
        formTemplateId: best.form_template_id,
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
