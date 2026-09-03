/**
 * Governed document links for a supervisory record.
 *
 * Evidence is never free text or a browser-held file: the officer links a
 * document that is already registered in the central document register, so the
 * link points at a governed record with its own reference, version history and
 * access controls. Linking and unlinking go through the governed DMS
 * operations, which re-check the officer's access to both the document and the
 * target record.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Paperclip } from 'lucide-react';
import { useDmsRegister } from '@/hooks/useDmsDocuments';
import { describeDmsError, linkDocumentToRecord } from '@/services/dms';

interface LinkedDocument {
  id: string;
  document_group_id: string;
  display_name: string | null;
  document_reference: string | null;
}

function useRecordDocumentLinks(targetType: string, targetId?: string) {
  return useQuery({
    queryKey: ['record-document-links', targetType, targetId],
    enabled: !!targetId,
    queryFn: async (): Promise<LinkedDocument[]> => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from('document_relationships')
        .select('id, document_group_id')
        .eq('target_type', targetType)
        .eq('target_id', targetId);
      if (error) throw error;
      const rows = (data ?? []) as { id: string; document_group_id: string }[];
      if (!rows.length) return [];
      const { data: groups } = await sb
        .from('document_groups')
        .select('id, display_name, document_reference')
        .in('id', rows.map(r => r.document_group_id));
      const byId = new Map((groups ?? []).map((g: any) => [g.id, g]));
      return rows.map(r => ({
        id: r.id,
        document_group_id: r.document_group_id,
        display_name: byId.get(r.document_group_id)?.display_name ?? null,
        document_reference: byId.get(r.document_group_id)?.document_reference ?? null,
      }));
    },
  });
}

interface Props {
  targetType: string;
  targetId: string;
  targetReference?: string | null;
  entityId?: string | null;
  disabled?: boolean;
  label?: string;
}

export function RecordDocumentLinks({
  targetType, targetId, targetReference, entityId, disabled, label = 'Registered evidence',
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: linked = [], isLoading } = useRecordDocumentLinks(targetType, targetId);
  const register = useDmsRegister({ search: search || undefined, entityId: entityId || undefined }, 0, 25);

  const link = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await linkDocumentToRecord({
        groupId, targetType, targetId,
        relationshipType: 'evidences',
        targetReference: targetReference ?? null,
      });
      if (res && typeof res === 'object' && 'error' in (res as any)) {
        throw new Error(String((res as any).error));
      }
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['record-document-links', targetType, targetId] });
      toast.success('Document linked as evidence');
    },
    onError: (e: any) => toast.error(describeDmsError(String(e?.message ?? e))),
  });

  const linkedIds = new Set(linked.map(l => l.document_group_id));
  const rows = register.data?.rows ?? [];

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {!disabled && (
          <Button type="button" size="sm" variant="outline" className="h-7"
            onClick={() => setOpen(true)}>
            <Paperclip className="mr-1 h-3.5 w-3.5" />Link document
          </Button>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-5 w-40" />
      ) : linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No registered document linked yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {linked.map(l => (
            <li key={l.id} className="flex items-center gap-2 text-xs">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a className="truncate underline-offset-2 hover:underline"
                href={`/documents/${l.document_group_id}`}>
                {l.display_name || 'Registered document'}
              </a>
              {l.document_reference && (
                <Badge variant="outline" className="font-mono text-[10px]">{l.document_reference}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Link registered evidence</DialogTitle>
            <DialogDescription>
              Only documents you are authorised to see in the central document register are listed.
            </DialogDescription>
          </DialogHeader>
          <Input placeholder="Search by reference, name or type…" value={search}
            onChange={e => setSearch(e.target.value)} />
          {register.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No registered documents match. Upload the document to the register first, then link it here.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.display_name || r.file_name || 'Document'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.document_reference, r.category_name, r.document_date].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Button type="button" size="sm" disabled={linkedIds.has(r.id) || link.isPending}
                    variant={linkedIds.has(r.id) ? 'secondary' : 'outline'}
                    onClick={() => link.mutate(r.id)}>
                    {linkedIds.has(r.id) ? 'Linked' : 'Link'}
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
