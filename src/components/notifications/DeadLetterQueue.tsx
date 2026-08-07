/**
 * Phase 9.5 — operator dead-letter queue.
 *
 * Reads `notification_dead_letters()` (enforces `notification_management.dispatch`
 * server-side) and surfaces communications that exhausted their retries or that
 * were never dispatchable because the provider is not configured. Nothing is
 * silently dropped: attempt count, failure category and error detail are shown,
 * and a resend goes through the existing `notification-retry` edge function.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2, RefreshCw, Send } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface DeadLetterRow {
  id: string;
  event_key: string | null;
  module: string | null;
  channel: string;
  recipient_destination: string | null;
  provider: string | null;
  communication_state: string;
  failure_category: string | null;
  error: string | null;
  retry_count: number | null;
  attempts: number | null;
  requested_at: string | null;
  failed_at: string | null;
  last_attempt_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

export function DeadLetterQueue() {
  const [rows, setRows] = useState<DeadLetterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('notification_dead_letters' as never, {
      _limit: 50,
      _offset: 0,
    } as never);
    if (error) {
      setRows([]);
    } else {
      setRows((data || []) as unknown as DeadLetterRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resend = async (id: string) => {
    setResending(id);
    const { data, error } = await supabase.functions.invoke('notification-retry', { body: { log_id: id } });
    const payload = data as { ok?: boolean; error?: string } | null;
    if (error || payload?.ok === false) {
      toast.error(payload?.error || error?.message || 'Resend failed');
    } else {
      toast.success('Resend requested');
      await load();
    }
    setResending(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" /> Dead-letter communications
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading dead-letter queue…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No dead-lettered or undeliverable communications.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Failure</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {r.requested_at ? format(new Date(r.requested_at), 'dd MMM yyyy HH:mm') : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.event_key || '—'}</TableCell>
                    <TableCell className="text-xs">{r.module || '—'}</TableCell>
                    <TableCell className="text-xs">{r.channel}</TableCell>
                    <TableCell className="text-xs">{r.recipient_destination || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="destructive" className="text-[11px] uppercase">
                        {String(r.communication_state).replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.retry_count ?? 0}
                      {r.last_attempt_at && (
                        <div className="text-[11px] text-muted-foreground">
                          last {format(new Date(r.last_attempt_at), 'dd MMM HH:mm')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[260px] text-xs">
                      {r.failure_category && <div className="text-destructive">{r.failure_category}</div>}
                      <div className="text-muted-foreground">{r.error || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resending === r.id || r.channel === 'in_app'}
                        onClick={() => void resend(r.id)}
                      >
                        {resending === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        <span className="ml-1">Resend</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DeadLetterQueue;
