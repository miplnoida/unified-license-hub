import { useQuery } from '@tanstack/react-query';
import {
  getReportSources, getReportDefinitions, getReportFilters,
  getOptionSet, getDashboardWidgets, getDashboardLayouts,
  getReportMetadataBundle, getReportStatusOptions, fetchTableOptions,
  getReportSourceColumns,
  type ReportFilterMeta,
} from '../services/reportMetadataService';
import { resolveFilterOptions } from '../services/reportFilterOptionsService';

export function useDynamicFilterOptions(meta: ReportFilterMeta | null | undefined, currentFilters: Record<string, any> = {}) {
  const parent = meta?.dependsOnFilter ? currentFilters?.[meta.dependsOnFilter] : null;
  return useQuery({
    queryKey: ['reports', 'filter-options', meta?.sourceKey, meta?.filterKey, parent || null],
    queryFn: () => resolveFilterOptions(meta!, currentFilters),
    enabled: !!meta,
    staleTime: 60_000,
  });
}

const STALE = 5 * 60_000;

export function useReportSources() {
  return useQuery({ queryKey: ['reports', 'metadata', 'sources'], queryFn: getReportSources, staleTime: STALE });
}

export function useReportDefinitions() {
  return useQuery({ queryKey: ['reports', 'metadata', 'definitions'], queryFn: getReportDefinitions, staleTime: STALE });
}

export function useDashboardLayouts() {
  return useQuery({ queryKey: ['reports', 'metadata', 'layouts'], queryFn: getDashboardLayouts, staleTime: STALE });
}

export function useDashboardWidgets(layoutKey: string) {
  return useQuery({
    queryKey: ['reports', 'metadata', 'widgets', layoutKey],
    queryFn: () => getDashboardWidgets(layoutKey),
    staleTime: STALE,
    enabled: !!layoutKey,
  });
}

export function useReportFilters(sourceKey: string | null | undefined) {
  return useQuery({
    queryKey: ['reports', 'metadata', 'filters', sourceKey],
    queryFn: () => getReportFilters(sourceKey!),
    staleTime: STALE,
    enabled: !!sourceKey,
  });
}

export function useReportStatusOptions(sourceKey: string | null | undefined, filterKey = 'status') {
  return useQuery({
    queryKey: ['reports', 'metadata', 'status', sourceKey, filterKey],
    queryFn: () => getReportStatusOptions(sourceKey!, filterKey),
    staleTime: STALE,
    enabled: !!sourceKey,
  });
}

export function useReportOptions(optionSetKey: string) {
  return useQuery({
    queryKey: ['reports', 'metadata', 'option-set', optionSetKey],
    queryFn: () => getOptionSet(optionSetKey),
    staleTime: STALE,
  });
}

export function useReportMetadataBundle() {
  return useQuery({ queryKey: ['reports', 'metadata', 'bundle'], queryFn: getReportMetadataBundle, staleTime: STALE });
}

export function useTableOptions(table: string | null | undefined, valueCol = 'id', labelCol = 'name') {
  return useQuery({
    queryKey: ['reports', 'metadata', 'table-options', table, valueCol, labelCol],
    queryFn: () => fetchTableOptions(table!, valueCol, labelCol),
    staleTime: STALE,
    enabled: !!table,
  });
}
