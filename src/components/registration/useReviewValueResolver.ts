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
export function useReviewValueResolver(
  schema: RegFormSchema | undefined,
  /**
   * Submitted values for this registration. Used to resolve master-data IDs by
   * targeted lookup — STATE/CITY types hold thousands of rows, far beyond the
   * backend's per-request row cap, so whole-type fetches cannot be relied on.
   */
  submittedValues?: Record<string, unknown> | null,
) {
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

  // Master-data values are stored as item IDs. Collect only the IDs actually
  // present in this submission and resolve those by ID — types such as STATE
  // (~5.3k rows) and CITY (~15k rows) exceed the per-request row cap, so
  // fetching a whole type would silently drop most labels.
  const masterIds = useMemo(() => {
    const values = submittedValues || {};
    const ids = new Set<string>();
    fields.forEach(f => {
      if (f.optionSource !== 'master_data') return;
      const raw = (values as Record<string, unknown>)[f.fieldName];
      const push = (v: unknown) => {
        if (typeof v === 'string' && UUID_RE.test(v)) ids.add(v);
      };
      if (Array.isArray(raw)) raw.forEach(push);
      else push(raw);
    });
    return Array.from(ids).sort();
  }, [fields, submittedValues]);

  const idChunks = useMemo(() => {
    const chunks: string[][] = [];
    for (let i = 0; i < masterIds.length; i += 100) chunks.push(masterIds.slice(i, i + 100));
    return chunks;
  }, [masterIds]);

  const masterItemQueries = useQueries({
    queries: idChunks.map(chunk => ({
      queryKey: ['master_data_review_items', chunk],
      staleTime: 5 * 60 * 1000,
      queryFn: async () => {
        const { data, error } = await supabase
          .from('master_data_items' as never)
          .select('id,name')
          .in('id', chunk);
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
    const masterItems = make(
      masterItemQueries.flatMap(q => ((q.data as { id: string; name: string }[]) || [])),
    );

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
