/**
 * RDM-ENTITY-001 Wave C — shared entity selector for the canonical returns
 * screens. Reads from the governed entity registry search RPC so the
 * CERTIFICATION DATASET v1 cohort (E01–E20) is what every screen exercises.
 */
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEntitySearch } from '@/hooks/useEntityRegistry';
import { Loader2, Search } from 'lucide-react';

export interface SelectedEntity {
  entity_id: string;
  legal_name: string;
}

export function EntityPicker({
  value,
  onSelect,
}: {
  value: SelectedEntity | null;
  onSelect: (e: SelectedEntity | null) => void;
}) {
  const [term, setTerm] = useState('');
  const { data: results = [], isLoading } = useEntitySearch(term);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{value.legal_name}</p>
          <p className="font-mono text-xs text-muted-foreground">{value.entity_id}</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => onSelect(null)}>
          Change entity
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search regulated entities by name or identifier…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </div>
      )}
      {!isLoading && results.length > 0 && (
        <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {results.map((r) => (
            <button
              key={r.entity_id}
              type="button"
              className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/60"
              onClick={() => onSelect({ entity_id: r.entity_id, legal_name: r.legal_name })}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.legal_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.licences?.length ?? 0} licence{(r.licences?.length ?? 0) === 1 ? '' : 's'}
                </p>
              </div>
              {r.lifecycle_label && <Badge variant="outline">{r.lifecycle_label}</Badge>}
            </button>
          ))}
        </div>
      )}
      {!isLoading && term.length > 1 && results.length === 0 && (
        <p className="p-2 text-sm text-muted-foreground">No entities matched “{term}”.</p>
      )}
    </div>
  );
}
