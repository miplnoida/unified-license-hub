/**
 * RDM-ENTITY-001 Wave C — DB-driven entity identifier types (§18).
 *
 * React must not hard-code identifier types (company registration number,
 * LEI, ...). This hook is the single place that loads the governed
 * identifier-type catalogue for onboarding UI, via the governed
 * `onboarding_identifier_catalogue()` RPC (the underlying
 * `entity_identifier_types` reference table is not directly client-readable).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EntityIdentifierType {
  key: string;
  label: string;
  description: string | null;
  issuer_hint: string | null;
  uniqueness_scope: string | null;
  requires_jurisdiction: boolean;
  requires_issuer: boolean;
  requires_regulator: boolean;
  is_unique_global: boolean;
  normalization: string | null;
  validation_regex: string | null;
  is_required: boolean;
  sort_order: number;
}

interface CatalogueResponse {
  generated_at: string;
  identifier_types: EntityIdentifierType[];
}

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase as any).rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
};

export function useIdentifierTypes() {
  return useQuery({
    queryKey: ['onboarding-identifier-catalogue'],
    queryFn: async (): Promise<EntityIdentifierType[]> => {
      const res = await rpc<CatalogueResponse>('onboarding_identifier_catalogue');
      return res?.identifier_types ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

/** A human-readable format hint built from the catalogue's governed metadata. */
export function formatHint(type: EntityIdentifierType | undefined): string | null {
  if (!type) return null;
  const parts: string[] = [];
  if (type.issuer_hint) parts.push(`Issued by ${type.issuer_hint}`);
  if (type.requires_jurisdiction) parts.push('jurisdiction required');
  if (type.requires_issuer) parts.push('issuer required');
  if (type.requires_regulator) parts.push('regulator required');
  if (type.is_unique_global) parts.push('globally unique');
  return parts.length ? parts.join(' · ') : null;
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
