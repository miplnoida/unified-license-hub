/**
 * Complaint intake queue (MC-02).
 *
 * The first working surface after a complaint is received: what still needs a
 * jurisdiction assessment, what is waiting for information, what is ready for
 * triage, which respondents are unmatched or suspected unauthorised, and which
 * support declarations still need a staff review.
 *
 * Rows and counts come from `public.complaint_intake_queue` /
 * `public.complaint_intake_queue_counts` — both scope-filtered server-side.
 * Nothing here decides anything; every action opens the complaint.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { formatDateTime } from '@/lib/datetime';
import { Search } from 'lucide-react';

const J_STATUS_LABEL: Record<string, string> = {
  PENDING_ASSESSMENT: 'Awaiting assessment',
  IN_ASSESSMENT: 'Assessment in progress',
  PENDING_INFORMATION: 'Waiting for information',
  DECIDED: 'Decision made',
};

const MATCH_LABEL: Record<string, string> = {
  matched_current: 'Currently regulated',
  matched_former: 'Formerly regulated',
  unmatched: 'Unmatched',
  suspected_unlicensed: 'Suspected unauthorised',
};

const ANY = 'any';

export default function IntakeQueue() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [jStatus, setJStatus] = useState(ANY);
  const [matchState, setMatchState] = useState(ANY);
  const [supportState, setSupportState] = useState(ANY);
  const [priority, setPriority] = useState(ANY);
  const [page, setPage] = useState(1);

  const filters: Record<string, unknown> = {};
  if (jStatus !== ANY) filters.jurisdiction_status = jStatus;
  if (matchState !== ANY) filters.respondent_match_state = matchState;
  if (supportState !== ANY) filters.support_review_state = supportState;
  if (priority !== ANY) filters.priority = priority;

  const countsQ = useQuery({
    queryKey: ['complaint-intake-queue-counts'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('complaint_intake_queue_counts', { _scope: {} });
      if (error) throw error;
      return data as any;
    },
  });

  const rowsQ = useQuery({
    queryKey: ['complaint-intake-queue', filters, search, page],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('complaint_intake_queue', {
        _filters: filters, _page: page, _page_size: 25, _search: search || null,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const counts = countsQ.data ?? {};
  const rows: any[] = rowsQ.data?.rows ?? [];
  const total: number = rowsQ.data?.total ?? 0;

  const tiles: Array<{ label: string; value: number; hint?: string; onClick?: () => void }> = [
    {
      label: 'Awaiting jurisdiction assessment',
      value: counts.awaiting_jurisdiction_assessment ?? 0,
      onClick: () => { setJStatus('PENDING_ASSESSMENT'); setPage(1); },
    },
    {
      label: 'Waiting for information',
      value: counts.waiting_for_information ?? 0,
      onClick: () => { setJStatus('PENDING_INFORMATION'); setPage(1); },
    },
    {
      label: 'Ready for triage',
      value: counts.ready_for_triage ?? 0,
      onClick: () => { setJStatus('DECIDED'); setPage(1); },
    },
    {
      label: 'Past the working target',
      value: counts.overdue_jurisdiction_assessments ?? 0,
      hint: counts.overdue_basis === 'CONFIGURED_OPERATIONAL_TARGET'
        ? 'Against the configured operational target'
        : 'No time target is configured, so none are counted',
    },
    {
      label: 'Support reviews pending',
      value: counts.support_reviews_pending ?? 0,
      onClick: () => { setSupportState('pending'); setPage(1); },
    },
    {
      label: 'Suspected unauthorised providers',
      value: counts.suspected_unauthorised ?? 0,
      onClick: () => { setMatchState('suspected_unlicensed'); setPage(1); },
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader
        title="Complaint intake queue"
        description="What has been received and what it needs next — jurisdiction assessment, information, triage or a support review."
      />


      {countsQ.isError ? (
        <QueryErrorState message="Failed to load queue counts" onRetry={() => countsQ.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-4">
          {tiles.map((t) => (
            <Card key={t.label} className={t.onClick ? 'cursor-pointer hover:border-primary/60' : ''}
                  onClick={t.onClick}>
              <CardContent className="pt-5">
                <p className="text-2xl font-semibold">{countsQ.isLoading ? '—' : t.value}</p>
                <p className="text-xs text-muted-foreground">{t.label}</p>
                {t.hint && <p className="text-[11px] text-muted-foreground mt-1">{t.hint}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mb-4">
        <CardContent className="pt-5 grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" value={search} placeholder="Reference, subject, complainant or firm"
                     onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Jurisdiction state</Label>
            <Select value={jStatus} onValueChange={(v) => { setJStatus(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All</SelectItem>
                {Object.entries(J_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Respondent</Label>
            <Select value={matchState} onValueChange={(v) => { setMatchState(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All</SelectItem>
                {Object.entries(MATCH_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={(v) => { setPriority(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All</SelectItem>
                {['p1', 'p2', 'p3', 'p4'].map((p) => (
                  <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {rowsQ.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : rowsQ.isError ? (
            <QueryErrorState message="Failed to load the intake queue" onRetry={() => rowsQ.refetch()} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nothing matches these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 pr-3">Received</th>
                    <th className="py-2 pr-3">Complained about</th>
                    <th className="py-2 pr-3">Jurisdiction</th>
                    <th className="py-2 pr-3">Triage</th>
                    <th className="py-2 pr-3">Priority</th>
                    <th className="py-2 pr-3">Age</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3">
                        <p className="font-medium">{r.complaint_number}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{r.subject}</p>
                      </td>
                      <td className="py-2 pr-3 text-xs">{formatDateTime(r.created_at)}</td>
                      <td className="py-2 pr-3">
                        <p>{r.respondent_name || 'Not identified'}</p>
                        <p className="text-xs text-muted-foreground">
                          {MATCH_LABEL[r.respondent_match_state] ?? 'Match state not recorded'}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={r.jurisdiction_status === 'DECIDED' ? 'default' : 'outline'}>
                          {J_STATUS_LABEL[r.jurisdiction_status] ?? r.jurisdiction_status}
                        </Badge>
                        {r.decision_outcome && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {String(r.decision_outcome).toLowerCase().replace(/_/g, ' ')}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {['CONFIRMED', 'OVERRIDDEN'].includes(String(r.triage_confirmation_status))
                          ? 'Confirmed'
                          : r.jurisdiction_status === 'DECIDED' &&
                            ['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(String(r.decision_outcome))
                            ? 'Ready to confirm'
                            : 'Blocked until jurisdiction is decided'}
                      </td>
                      <td className="py-2 pr-3 text-xs">{(r.priority || '—').toString().toUpperCase()}</td>
                      <td className="py-2 pr-3 text-xs">{r.age_days ?? 0}d</td>
                      <td className="py-2">
                        <Button size="sm" variant="outline"
                                onClick={() => navigate(`/complaints/${r.id}?section=casework&sub=jurisdiction`)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
                <span>{total} complaint{total === 1 ? '' : 's'}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page * 25 >= total}
                          onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
