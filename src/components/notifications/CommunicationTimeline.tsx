/**
 * Phase 9.7 — chronological outbound communication timeline for a parent object.
 *
 * Reads the `communication_timeline(_object_type, _object_id)` RPC. That RPC
 * authorizes through the parent object (an object the caller cannot read yields
 * a 42501), so this component never needs its own access rules and a user can't
 * discover another entity's communications by guessing an ID.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

export type CommunicationObjectType =
  | 'application'
  | 'complaint'
  | 'fp_assessment'
  | 'prudential_action'
  | 'conduct_investigation'
  | 'enforcement_action';

export interface CommunicationTimelineRow {
  id: string;
  occurred_at: string;
  direction: string;
  channel: string;
  event_key: string | null;
  subject: string | null;
  recipient: string | null;
  recipient_user_id: string | null;
  communication_state: string;
  provider: string | null;
  provider_message_id: string | null;
  failure_category: string | null;
  error: string | null;
  retry_count: number | null;
  template_id: string | null;
  template_version: number | null;
  rendered_content_ref: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  sent_to_provider_at: string | null;
}

/** Truthful badge tone per canonical state — SENT_TO_PROVIDER is never "delivered". */
export function stateTone(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'DELIVERED':
      return 'default';
    case 'FAILED':
    case 'DEAD_LETTER':
      return 'destructive';
    case 'SENT_TO_PROVIDER':
    case 'RETRYING':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function stateLabel(state: string): string {
  return String(state || '').replace(/_/g, ' ').toLowerCase();
}

interface Props {
  objectType: CommunicationObjectType;
  objectId: string;
  title?: string;
}

export function CommunicationTimeline({ objectType, objectId, title = 'Communications' }: Props) {
  const [rows, setRows] = useState<CommunicationTimelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!objectId) return;
    setLoading(true);
    setError(null);
    setDenied(false);
    const { data, error: rpcError } = await supabase.rpc('communication_timeline' as never, {
      _object_type: objectType,
      _object_id: objectId,
    } as never);
    if (rpcError) {
      if (rpcError.code === '42501' || /not authorized/i.test(rpcError.message)) setDenied(true);
      else setError(rpcError.message);
      setRows([]);
    } else {
      setRows((data || []) as unknown as CommunicationTimelineRow[]);
    }
    setLoading(false);
  }, [objectType, objectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (denied) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> You are not authorized to view communications for this record.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" /> {title}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading communications…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No communications recorded for this record.</p>
        ) : (
          <ol className="relative space-y-3 border-l pl-4">
            {rows.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -left-[21px] top-2 h-3 w-3 rounded-full bg-primary" />
                <MessageCard row={r} />
              </li>
            ))}
          </ol>

        )}
      </CardContent>
    </Card>
  );
}

export default CommunicationTimeline;
