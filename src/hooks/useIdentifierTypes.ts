/**
 * RDM-ENTITY-001 Wave C — DB-driven entity identifier types (§18).
 *
 * React must not hard-code identifier types (company registration number,
 * LEI, ...). This hook is the single place that loads the governed
 * `entity_identifier_types` reference table for onboarding UI.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EntityIdentifierType {
  id: string;
  key: string;
  label: string;
  description: string | null;
  issuer: string | null;
  validation_regex: string | null;
  sort_order: number;
}

const db = () => supabase as unknown as { from: (table: string) => any };

export function useIdentifierTypes() {
  return useQuery({
    queryKey: ['entity-identifier-types', 'active'],
    queryFn: async (): Promise<EntityIdentifierType[]> => {
      const { data, error } = await db()
        .from('entity_identifier_types')
        .select('id, key, label, description, issuer, validation_regex, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data || []) as EntityIdentifierType[];
    },
    staleTime: 5 * 60_000,
  });
}

/** Validates a value against the identifier type's governed format, when one is configured. */
export function validateIdentifierValue(type: EntityIdentifierType | undefined, value: string): string | null {
  if (!type || !value) return null;
  if (!type.validation_regex) return null;
  try {
    const re = new RegExp(type.validation_regex);
    return re.test(value) ? null : `Does not match the expected format for ${type.label}`;
  } catch {
    return null;
  }
}
