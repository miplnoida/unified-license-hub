/**
 * Governed evidence linking for AML/CFT working papers.
 *
 * Evidence is not free text: the officer picks registered documents from the
 * central document register, so every reference points at a real, governed
 * record with its own reference, version and access controls. A short note may
 * be added to explain what the document evidences, but the document itself is
 * always the authoritative artefact.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Paperclip, X } from 'lucide-react';
import { useDmsRegister } from '@/hooks/useDmsDocuments';
import { NEUTRAL } from '@/lib/amlLabels';

export interface AmlEvidenceRef {
  [key: string]: unknown;
  /** Canonical document group id in the central document register. */
  document_id: string;
  document_reference: string | null;
  display_name: string | null;
  note?: string | null;
}

interface Props {
  entityId?: string;
  value: AmlEvidenceRef[];
  onChange: (next: AmlEvidenceRef[]) => void;
  disabled?: boolean;
  requiredCount?: number;
  label?: string;
}

export function AmlEvidenceLinker({
  entityId,
  value,
  onChange,
  disabled,
  requiredCount = 0,
  label = 'Governed evidence',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useDmsRegister({ search: search || undefined, entityId }, 0, 25);

  const selected = useMemo(() => new Set(value.map((v) => v.document_id)), [value]);
  const rows = data?.rows ?? [];

  const add = (row: (typeof rows)[number]) => {
    if (selected.has(row.id)) return;
    onChange([
      ...value,
      {
        document_id: row.id,
        document_reference: row.document_reference,
        display_name: row.display_name ?? row.file_name ?? null,
      },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>
          {label}
          {requiredCount > 0 ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              minimum {requiredCount} — {value.length} linked
            </span>
          ) : null}
        </Label>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} disabled={disabled}>
          <Paperclip className="mr-1.5 h-3.5 w-3.5" />
          Link document
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No governed documents linked. Evidence must be a registered document in the central document register.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {value.map((ref) => (
            <li key={ref.document_id} className="rounded-md border p-2">
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{ref.display_name || 'Registered document'}</p>
                  {ref.document_reference ? (
                    <Badge variant="outline" className={`${NEUTRAL} mt-1 font-mono text-[10px]`}>
                      {ref.document_reference}
                    </Badge>
                  ) : null}
                  <Input
                    className="mt-2 h-8 text-xs"
                    placeholder="What does this document evidence? (optional)"
                    value={ref.note ?? ''}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange(
                        value.map((v) =>
                          v.document_id === ref.document_id ? { ...v, note: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={disabled}
                  onClick={() => onChange(value.filter((v) => v.document_id !== ref.document_id))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Link governed evidence</DialogTitle>
            <DialogDescription>
              Only documents you are authorised to see in the central document register are listed.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search by reference, name or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No registered documents match. Upload the document to the register first, then link it here.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.display_name || r.file_name || 'Document'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.document_reference, r.category_name, r.document_date].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={selected.has(r.id) ? 'secondary' : 'outline'}
                    disabled={selected.has(r.id)}
                    onClick={() => add(r)}
                  >
                    {selected.has(r.id) ? 'Linked' : 'Link'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
