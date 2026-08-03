/**
 * Notification Channel Health — administrator view of delivery infrastructure.
 *
 * Shows configuration state, delivery counters, queue depth, worker/cron status
 * and recent (redacted) provider errors, with manual retry / resend per row.
 * Gated by notification_management.view via the route wrapper and the RPC.
 */
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquareOff,
  RefreshCw,
  Timer,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { useChannelHealth, useRetryDispatch } from '@/hooks/useChannelHealth';

const relative = (iso: string | null) =>
  iso ? `${formatDistanceToNow(new Date(iso))} ago` : '—';

export default function NotificationChannelHealth() {
  const { data, isLoading, error, refetch, isFetching } = useChannelHealth();
  const retry = useRetryDispatch();

  const onRetry = (id: string) => {
    retry.mutate(id, {
      onSuccess: () => toast({ title: 'Resend requested', description: 'The message has been queued for another attempt.' }),
      onError: (e: unknown) =>
        toast({
          title: 'Resend failed',
          description: e instanceof Error ? e.message : 'Unable to resend this message.',
          variant: 'destructive',
        }),
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <XCircle className="h-8 w-8 mx-auto text-destructive" />
            <p className="text-sm text-muted-foreground">
              Channel health is unavailable. You may not have notification management access.
            </p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const emailHealthy = data.smtp.configured && data.email.failures_1h === 0;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notification Channel Health</h1>
          <p className="text-sm text-muted-foreground">
            Delivery infrastructure status · updated {relative(data.generated_at)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" /> Email (SMTP)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              {emailHealthy
                ? <CheckCircle2 className="h-4 w-4 text-primary" />
                : <AlertTriangle className="h-4 w-4 text-destructive" />}
              <Badge variant={data.smtp.configured ? 'default' : 'destructive'}>
                {data.smtp.configured ? 'Configured' : 'Not configured'}
              </Badge>
            </div>
            <dl className="text-sm space-y-1">
              <div className="flex justify-between"><dt className="text-muted-foreground">Last successful send</dt><dd>{relative(data.email.last_success_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Sent (24h)</dt><dd className="font-mono">{data.email.sent_24h}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Failures (1h / 24h)</dt><dd className="font-mono">{data.email.failures_1h} / {data.email.failures_24h}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Bounced (24h)</dt><dd className="font-mono">{data.email.bounced_24h}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Retries exhausted</dt><dd className="font-mono">{data.email.poisoned}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground pt-1">
              SMTP acceptance is recorded as “sent”. “Delivered” requires a provider callback.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquareOff className="h-4 w-4" /> SMS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant="secondary">Not available</Badge>
            <p className="text-sm text-muted-foreground">
              No SMS provider is configured. SMS-selected notifications are recorded as skipped —
              never as delivered — and are always also sent in-app.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4" /> Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="text-sm space-y-1">
              <div className="flex justify-between"><dt className="text-muted-foreground">Dispatch pending</dt><dd className="font-mono">{data.queue.dispatch_pending}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Oldest pending</dt><dd>{relative(data.queue.dispatch_oldest_pending_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Event queue pending</dt><dd className="font-mono">{data.queue.event_queue_pending}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Event queue dead</dt><dd className="font-mono">{data.queue.event_queue_dead}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Retry backlog</dt><dd className="font-mono">{data.queue.retry_backlog}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">In-app failures (24h)</dt><dd className="font-mono">{data.in_app.failures_24h}</dd></div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" /> Schedulers and workers
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.workers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scheduled notification jobs found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.workers.map((w) => (
                  <TableRow key={w.jobname}>
                    <TableCell className="font-medium">{w.jobname}</TableCell>
                    <TableCell className="font-mono text-xs">{w.schedule}</TableCell>
                    <TableCell>
                      <Badge variant={w.active ? 'default' : 'secondary'}>{w.active ? 'Active' : 'Paused'}</Badge>
                    </TableCell>
                    <TableCell>{relative(w.last_run_at)}</TableCell>
                    <TableCell>
                      {w.last_status
                        ? <Badge variant={w.last_status === 'succeeded' ? 'outline' : 'destructive'}>{w.last_status}</Badge>
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Recent delivery errors
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.recent_errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No delivery failures recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_errors.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{relative(e.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.event_key}</TableCell>
                    <TableCell>{e.channel}</TableCell>
                    <TableCell className="font-mono text-xs">{e.recipient_masked || '—'}</TableCell>
                    <TableCell><Badge variant="destructive">{e.status}</Badge></TableCell>
                    <TableCell className="font-mono">{e.attempts ?? 0}</TableCell>
                    <TableCell className="max-w-[24rem] text-xs text-muted-foreground">{e.error}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => onRetry(e.id)}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${retry.isPending ? 'animate-spin' : ''}`} />
                        Resend
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
