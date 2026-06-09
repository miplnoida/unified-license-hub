import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportFilters } from '../../hooks/useReportMetadata';
import {
  resolveFilterOptions, type FilterOption,
} from '../../services/reportFilterOptionsService';
import type { ReportFilterMeta } from '../../services/reportMetadataService';
import type { ReportFilters } from '../../types';

export interface DynamicReportFiltersProps {
  sourceKey: string;
  filters: ReportFilters;
  onChange: (patch: Record<string, any>) => void;
}

const ANY = '__any__';

function FilterField({
  meta, filters, onChange,
}: { meta: ReportFilterMeta; filters: ReportFilters; onChange: (patch: Record<string, any>) => void }) {
  const needsOptions = ['select', 'multi_select'].includes(meta.filterType);
  const parent = meta.dependsOnFilter ? (filters as any)?.[meta.dependsOnFilter] : null;

  const optsQ = useQuery<FilterOption[]>({
    queryKey: ['reports', 'filter-options', meta.sourceKey, meta.filterKey, parent || null],
    queryFn: () => resolveFilterOptions(meta, filters as any),
    enabled: needsOptions,
    staleTime: 60_000,
  });

  // Clear stale dependent value when parent changes and value no longer valid
  useEffect(() => {
    if (!needsOptions) return;
    const current = (filters as any)?.[meta.filterKey];
    if (!current || !optsQ.data?.length) return;
    if (!optsQ.data.find((o) => o.value === current)) {
      onChange({ [meta.filterKey]: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optsQ.data]);

  const value = (filters as any)?.[meta.filterKey] ?? '';
  const set = (v: any) => {
    const patch: Record<string, any> = { [meta.filterKey]: v };
    if (meta.filterKey === 'preset' && v && v !== 'custom') {
      // metadata-driven preset clears explicit dates
      patch.dateFrom = '';
      patch.dateTo = '';
    }
    if (meta.filterKey === 'dateFrom' || meta.filterKey === 'dateTo') {
      patch.preset = 'custom';
    }
    onChange(patch);
  };

  const labelEl = <Label>{meta.label}</Label>;

  if (meta.filterType === 'text') {
    return (
      <div className="space-y-2">
        {labelEl}
        <Input value={value || ''} onChange={(e) => set(e.target.value)} placeholder="optional" />
      </div>
    );
  }
  if (meta.filterType === 'number') {
    return (
      <div className="space-y-2">
        {labelEl}
        <Input type="number" value={value ?? ''} onChange={(e) => set(e.target.value)} />
      </div>
    );
  }
  if (meta.filterType === 'date') {
    return (
      <div className="space-y-2">
        {labelEl}
        <Input type="date" value={value || ''} onChange={(e) => set(e.target.value)} />
      </div>
    );
  }
  if (meta.filterType === 'boolean') {
    return (
      <div className="space-y-2">
        {labelEl}
        <Select value={value === '' || value == null ? ANY : String(value)} onValueChange={(v) => set(v === ANY ? '' : v === 'true')}>
          <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (meta.filterType === 'select' || meta.filterType === 'multi_select') {
    const opts = optsQ.data || [];
    return (
      <div className="space-y-2">
        {labelEl}
        {optsQ.isLoading ? <Skeleton className="h-10 w-full" /> : (
          <Select value={value || ANY} onValueChange={(v) => set(v === ANY ? '' : v)} disabled={!opts.length}>
            <SelectTrigger><SelectValue placeholder={opts.length ? 'Any' : 'No options'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any</SelectItem>
              {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  }
  return null;
}

export function DynamicReportFilters({ sourceKey, filters, onChange }: DynamicReportFiltersProps) {
  const { data, isLoading } = useReportFilters(sourceKey);

  if (isLoading) {
    return (
      <div className="grid md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }
  const filtersMeta = (data || []).filter((m) => m.isActive);
  if (!filtersMeta.length) return null;

  return (
    <div className="grid md:grid-cols-4 gap-4">
      {filtersMeta.map((m) => (
        <FilterField key={`${m.sourceKey}:${m.filterKey}`} meta={m} filters={filters} onChange={onChange} />
      ))}
    </div>
  );
}
