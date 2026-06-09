import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useReportOptions, useReportStatusOptions } from '../../hooks/useReportMetadata';
import type { ReportFilters, ReportSource } from '../../types';

interface Props {
  source: ReportSource;
  filters: ReportFilters;
  onChange: (patch: Record<string, any>) => void;
}

/**
 * Fallback filter block, only rendered when no metadata filters are configured
 * for the selected source in `report_source_filters`.
 */
export function BasicFallbackFilters({ source, filters, onChange }: Props) {
  const { data: presets = [] } = useReportOptions('date_preset');
  const { data: statusRows = [] } = useReportStatusOptions(source);

  return (
    <div className="grid md:grid-cols-4 gap-4">
      <div className="space-y-2">
        <Label>Date Preset</Label>
        <Select value={filters.preset || 'custom'} onValueChange={(v) => onChange({ preset: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {presets.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>From</Label>
        <Input type="date" value={filters.dateFrom || ''} onChange={(e) => onChange({ dateFrom: e.target.value, preset: 'custom' })} />
      </div>
      <div className="space-y-2">
        <Label>To</Label>
        <Input type="date" value={filters.dateTo || ''} onChange={(e) => onChange({ dateTo: e.target.value, preset: 'custom' })} />
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        {statusRows.length ? (
          <Select value={filters.status || 'all'} onValueChange={(v) => onChange({ status: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              {statusRows.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input value={filters.status || ''} onChange={(e) => onChange({ status: e.target.value })} placeholder="any" />
        )}
      </div>
    </div>
  );
}
