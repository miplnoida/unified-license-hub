import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSectors, useSubSectors, useCategories } from '@/hooks/useMasterConfig';
import type { RegField, RegFormSchema } from '@/types/registrationForm';

type LookupMap = Record<string, string>; // value(id) -> label(name)

function collectFields(schema: RegFormSchema | undefined): RegField[] {
  if (!schema) return [];
  const out: RegField[] = [];
  schema.forEach(s => s.rows.forEach(r => r.columns.forEach(c => { if (c.field) out.push(c.field); })));
  return out;
}

/**
 * Builds a resolver that maps stored option IDs (sector, sub-sector, category,
 * country, state, master data) to their human-readable labels for the review
 * screen. Falls back to the raw value if the lookup cannot be resolved.
 */
export function useReviewValueResolver(schema: RegFormSchema | undefined) {
  const fields = useMemo(() => collectFields(schema), [schema]);

  const needsCountries = fields.some(f => f.dataSource === 'country');
  const needsStates = fields.some(f => f.dataSource === 'state');
  const { data: sectors = [] } = useSectors();
  const { data: subSectors = [] } = useSubSectors();
  const { data: categories = [] } = useCategories();

  const { data: countries = [] } = useQuery({
    queryKey: ['countries-review'],
    enabled: needsCountries || needsStates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('countries' as never)
        .select('id,name')
        .eq('status', 'active');
      if (error) throw error;
      return (data || []) as unknown as { id: string; name: string }[];
    },
  });

  const { data: states = [] } = useQuery({
    queryKey: ['states-review'],
    enabled: needsStates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('states' as never)
        .select('id,name')
        .eq('status', 'active');
      if (error) throw error;
      return (data || []) as unknown as { id: string; name: string }[];
    },
  });

  // Unique master-data type codes used by select/multi/radio fields
  const masterCodes = useMemo(() => {
    const codes = new Set<string>();
    fields.forEach(f => {
      if (f.optionSource === 'master_data' && f.masterDataTypeCode) codes.add(f.masterDataTypeCode);
    });
    return Array.from(codes);
  }, [fields]);

  const masterQueries = useQueries({
    queries: masterCodes.map(code => ({
      queryKey: ['master_data_review', code],
      queryFn: async () => {
        const { data: t1 } = await supabase
          .from('master_data_types' as never)
          .select('id')
          .eq('code', code)
          .eq('status', 'active')
          .maybeSingle();
        let typeData: any = t1;
        if (!typeData) {
          const { data: t2 } = await supabase
            .from('master_data_types' as never)
            .select('id')
            .eq('name', code)
            .eq('status', 'active')
            .maybeSingle();
          typeData = t2;
        }
        if (!typeData) return [] as { id: string; name: string }[];
        const { data, error } = await supabase
          .from('master_data_items' as never)
          .select('id,name')
          .eq('type_id', (typeData as any).id);
        if (error) throw error;
        return (data || []) as unknown as { id: string; name: string }[];
      },
    })),
  });

  const lookups = useMemo(() => {
    const make = (rows: { id: string; name: string }[]): LookupMap => {
      const m: LookupMap = {};
      rows.forEach(r => { m[String(r.id)] = r.name; });
      return m;
    };
    const masters: Record<string, LookupMap> = {};
    masterCodes.forEach((code, i) => {
      masters[code] = make((masterQueries[i]?.data as any) || []);
    });
    return {
      sector: make(sectors as any),
      sub_sector: make(subSectors as any),
      category: make(categories as any),
      country: make(countries as any),
      state: make(states as any),
      masters,
    };
  }, [sectors, subSectors, categories, countries, states, masterCodes, masterQueries]);

  return useMemo(() => {
    function resolveOne(field: RegField, raw: unknown): unknown {
      if (raw == null || raw === '') return raw;
      const optionTypes = ['select', 'multi_select', 'radio'];
      if (!optionTypes.includes(field.type)) return raw;

      const mapValue = (val: unknown): unknown => {
        const key = String(val);
        if (field.optionSource === 'master_data' && field.masterDataTypeCode) {
          return lookups.masters[field.masterDataTypeCode]?.[key] ?? val;
        }
        if (field.dataSource && lookups[field.dataSource]) {
          return lookups[field.dataSource][key] ?? val;
        }
        // Heuristic country detection by fieldName/label
        const fn = field.fieldName?.toLowerCase() || '';
        const lbl = field.label?.toLowerCase() || '';
        if (fn === 'country' || fn === 'countryid' || fn === 'country_id' || lbl.includes('country')) {
          return lookups.country[key] ?? val;
        }
        if (fn === 'state' || fn === 'stateid' || fn === 'state_id' || lbl.includes('state')) {
          return lookups.state[key] ?? val;
        }
        // Manual options: value === label already
        return val;
      };

      if (Array.isArray(raw)) return raw.map(mapValue).join(', ');
      return mapValue(raw);
    }
    return resolveOne;
  }, [lookups]);
}
