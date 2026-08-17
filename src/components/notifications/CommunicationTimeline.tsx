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
import { Loader2, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import {
  plainChannelLabel,
  plainDirectionLabel,
  plainFailureReason,
  plainStateHint,
  plainStateLabel,
  plainSubject,
} from '@/lib/communicationPlainLanguage';


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
    try {
      const { data, error: rpcError } = await supabase.rpc('communication_timeline' as never, {
        _object_type: objectType,
        _object_id: objectId,
      } as never);
      if (rpcError) throw rpcError;
      setRows((data || []) as unknown as CommunicationTimelineRow[]);
    } catch (e: any) {
      // Any thrown exception must still terminate the loader — otherwise the
      // spinner would stay on screen forever.
      const message = e?.message ?? 'Unexpected error';
      if (e?.code === '42501' || /not authorized|permission denied/i.test(message)) setDenied(true);
      else setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
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
        {error ? (
          <QueryErrorState
            title="We couldn’t load communications"
            message="Communications could not be loaded. This is a temporary problem — please try again."
            onRetry={() => void load()}
            compact
          />
        ) : loading ? (
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

function MessageCard({ row }: { row: CommunicationTimelineRow }) {
  const [showDetails, setShowDetails] = useState(false);
  const hint = plainStateHint(row.communication_state);
  const reason = plainFailureReason(row.failure_category, row.error);
  const attempts = row.retry_count ?? 0;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{plainSubject(row.subject, row.event_key)}</span>
        <Badge variant={stateTone(row.communication_state)} className="text-[11px]">
          {plainStateLabel(row.communication_state)}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {plainChannelLabel(row.channel)} · {plainDirectionLabel(row.direction)}
        {row.recipient ? ` · to ${row.recipient}` : ''}
        {row.occurred_at ? ` · ${format(new Date(row.occurred_at), 'dd MMM yyyy HH:mm')}` : ''}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {reason && <p className="mt-1 text-xs text-destructive">{reason}</p>}
      {attempts > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Sending was attempted {attempts + 1} time{attempts + 1 === 1 ? '' : 's'}.
        </p>
      )}
      <button
        type="button"
        onClick={() => setShowDetails((s) => !s)}
        className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {showDetails ? 'Hide technical details' : 'Technical details'}
      </button>
      {showDetails && (
        <dl className="mt-2 grid gap-1 rounded bg-muted/50 p-2 text-[11px] text-muted-foreground sm:grid-cols-2">
          <Detail label="Internal state" value={row.communication_state} mono />
          <Detail label="Event key" value={row.event_key} mono />
          <Detail label="Provider" value={row.provider} />
          <Detail label="Provider message ID" value={row.provider_message_id} mono />
          <Detail label="Template version" value={row.template_version != null ? `v${row.template_version}` : null} />
          <Detail label="Failure category" value={row.failure_category} mono />
          <Detail label="Error" value={row.error} />
          <Detail
            label="Delivered at"
            value={row.delivered_at ? format(new Date(row.delivered_at), 'dd MMM yyyy HH:mm') : null}
          />
        </dl>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt className="inline text-foreground/70">{label}: </dt>
      <dd className={`inline ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}


export default CommunicationTimeline;
