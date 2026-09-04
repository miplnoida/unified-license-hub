/**
 * RecordPicker — choose a *business record* to link a document to.
 *
 * This is the replacement for any surface that asked an officer to paste an
 * internal identifier. The officer chooses a record type, searches real records
 * they are authorised to see, and selects one; the internal identifier is
 * returned to the caller and never shown.
 *
 * Reads are server-paged through the governed `record_picker_page` operation,
 * which runs with the caller's own privileges, so the picker can only ever list
 * records the user could already open.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PaginationBar } from '@/components/shared/listing/PaginationBar';
import {
  RECORD_PICKER_TYPES, type RecordPickerRow, type RecordPickerType,
  searchRecords,
} from '@/services/recordPicker';
import { humanize } from '@/lib/presentation/statusLabels';

interface RecordPickerProps {
  /** Restrict the picker to these record types (in this order). */
  allowedTypes?: RecordPickerType[];
  /** Initially selected record type. */
  defaultType?: RecordPickerType;
  /** Context entity — its records are ranked first. */
  entityId?: string | null;
  /** Records already linked; shown as such and not selectable again. */
  linkedRecordIds?: string[];
  onSelect: (row: RecordPickerRow) => void;
  busy?: boolean;
}

export function RecordPicker({
  allowedTypes, defaultType, entityId, linkedRecordIds = [], onSelect, busy,
}: RecordPickerProps) {
  const types = useMemo(
    () => (allowedTypes?.length
      ? RECORD_PICKER_TYPES.filter((t) => allowedTypes.includes(t.value))
        .sort((a, b) => allowedTypes.indexOf(a.value) - allowedTypes.indexOf(b.value))
      : RECORD_PICKER_TYPES),
    [allowedTypes],
  );

  const [recordType, setRecordType] = useState<RecordPickerType>(
    defaultType && types.some((t) => t.value === defaultType) ? defaultType : types[0].value,
  );
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Debounce so each keystroke does not become a server round-trip.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(term); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [term]);

  const activeType = types.find((t) => t.value === recordType) ?? types[0];
  const linked = new Set(linkedRecordIds);

  const query = useQuery({
    queryKey: ['record-picker', recordType, search, entityId ?? null, page, pageSize],
    queryFn: async () => {
      const res = await searchRecords({ recordType, search, entityId, page, pageSize });
      if ('error' in res) throw new Error(res.error);
      return res.data;
    },
    staleTime: 15_000,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  // Owner-level page repair: never present "no records" because of a stale page.
  useEffect(() => {
    if (!query.data) return;
    // `total` is authoritative even when this page holds no rows, so an
    // out-of-range page always recovers to the last real page.
    const lastPage = query.data.lastPage || Math.max(1, Math.ceil(total / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [query.data, total, page, pageSize]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <div className="space-y-1.5">
          <Label>Record type</Label>
          <Select
            value={recordType}
            onValueChange={(v) => { setRecordType(v as RecordPickerType); setPage(1); }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Find the record</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={activeType.searchHint}
            />
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : query.isError ? (
        <p className="py-6 text-center text-sm text-destructive">
          The record search could not be completed. Please try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No {activeType.label.toLowerCase()} records you can access match this search.
        </p>
      ) : (
        <ul className="max-h-[22rem] divide-y overflow-y-auto rounded-md border">
          {rows.map((r) => {
            const already = linked.has(r.recordId);
            return (
              <li key={r.recordId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {r.reference ? (
                      <span className="font-mono text-xs">{r.reference}</span>
                    ) : null}
                    <span className="truncate">{r.title || r.entityName || activeType.label}</span>
                    {r.status ? (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {humanize(r.status)}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[r.entityName, r.secondary].filter(Boolean).join(' · ') || activeType.label}
                  </p>
                </div>
                <Button
                  type="button" size="sm"
                  variant={already ? 'secondary' : 'outline'}
                  disabled={already || busy}
                  onClick={() => onSelect(r)}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : already ? 'Linked' : 'Select'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <PaginationBar
        totalCount={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        alwaysShowCount
      />
    </div>
  );
}

export default RecordPicker;
