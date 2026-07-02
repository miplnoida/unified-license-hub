import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RfiResponse {
  id: string;
  rfi_item_id: string;
  response_text: string | null;
  file_upload_ids: string[];
  submitted_by: string;
  submitted_at: string;
}

export interface RfiItem {
  id: string;
  rfi_id: string;
  ordinal: number;
  prompt: string;
  question_type: 'text' | 'document' | 'both';
  required: boolean;
  item_due_at: string | null;
  response_status: 'pending' | 'responded' | 'skipped';
  responses?: RfiResponse[];
}

export interface Rfi {
  id: string;
  application_id: string;
  raised_by: string;
  raised_at: string;
  due_at: string | null;
  status: 'open' | 'responded' | 'closed' | 'cancelled';
  summary: string | null;
  closure_notes: string | null;
  closed_by: string | null;
  closed_at: string | null;
  approval_step_action_id: string | null;
  items?: RfiItem[];

}

export function useApplicationRfis(applicationId: string | undefined) {
  const [rfis, setRfis] = useState<Rfi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    const { data: rfiRows, error: rfiErr } = await supabase
      .from('application_rfis' as any)
      .select('*')
      .eq('application_id', applicationId)
      .order('raised_at', { ascending: false });
    if (rfiErr) {
      setError(rfiErr.message);
      setLoading(false);
      return;
    }
    const list = (rfiRows as any[]) || [];
    const rfiIds = list.map((r) => r.id);
    let items: any[] = [];
    let responses: any[] = [];
    if (rfiIds.length) {
      const { data: it } = await supabase
        .from('application_rfi_items' as any)
        .select('*')
        .in('rfi_id', rfiIds)
        .order('ordinal', { ascending: true });
      items = (it as any[]) || [];
      const itemIds = items.map((x) => x.id);
      if (itemIds.length) {
        const { data: resp } = await supabase
          .from('application_rfi_responses' as any)
          .select('*')
          .in('rfi_item_id', itemIds)
          .order('submitted_at', { ascending: true });
        responses = (resp as any[]) || [];
      }
    }
    const grouped: Rfi[] = list.map((r) => ({
      ...r,
      items: items
        .filter((it) => it.rfi_id === r.id)
        .map((it) => ({
          ...it,
          responses: responses.filter((rr) => rr.rfi_item_id === it.id),
        })),
    }));
    setRfis(grouped);
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    load();
  }, [load]);

  return { rfis, loading, error, reload: load };
}
