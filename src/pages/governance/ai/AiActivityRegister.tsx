/**
 * MC-08 — AI Activity Register.
 *
 * Every AI request the platform made or refused: who asked, which capability,
 * which model and instruction version, which facts window, what came back, and
 * what the officer decided. Read-only evidence — nothing here can be altered.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useAiActivity, useAiUseCases, type ActivityRow } from '@/hooks/useAiGovernance';
import {
  OUTCOME_LABEL, OUTCOME_VARIANT, REASON_LABEL, REVIEW_STATE_LABEL, REVIEW_STATE_VARIANT, label,
} from '@/lib/aiGovernanceLabels';
import { formatDateTime } from '@/lib/datetime';

const PAGE_SIZE = 50;
const OUTCOMES = ['SUCCESS', 'GOVERNANCE_REFUSAL', 'SCOPE_REFUSAL', 'REFUSAL', 'FAILURE', 'PROVIDER_ERROR'];
const REVIEW_STATES = ['NOT_REVIEWED', 'ACCEPTED', 'MODIFIED', 'REJECTED', 'SUPERSEDED'];

export default function AiActivityRegister() {
  const [useCase, setUseCase] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [reviewState, setReviewState] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  const { data: useCases = [] } = useAiUseCases();
  const filters = useMemo(() => ({
    useCaseCode: useCase === 'all' ? null : useCase,
    outcome: outcome === 'all' ? null : outcome,
    reviewState: reviewState === 'all' ? null : reviewState,
    from: from ? `${from}T00:00:00Z` : null,
    to: to ? `${to}T23:59:59Z` : null,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [useCase, outcome, reviewState, from, to, page]);

  const { data: rows = [], isLoading } = useAiActivity(filters);

  const renderRow = (r: ActivityRow) => (
    <TableRow key={`${r.activity_kind}-${r.activity_id}`}>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(r.occurred_at)}</TableCell>
      <TableCell className="text-sm">
        {r.use_case_label ?? r.use_case_code ?? 'Not recorded'}
        <p className="text-xs text-muted-foreground">{r.owning_module ?? ''}</p>
      </TableCell>
      <TableCell>
        <Badge variant={OUTCOME_VARIANT[r.outcome] ?? 'outline'}>{label(OUTCOME_LABEL, r.outcome)}</Badge>
        {r.reason_code && (
          <p className="mt-1 text-xs text-muted-foreground">{label(REASON_LABEL, r.reason_code)}</p>
        )}
      </TableCell>
      <TableCell className="text-xs">
        <p>{r.model_version ?? r.model ?? 'Not recorded'}</p>
        <p className="text-muted-foreground">
          {r.prompt_template_code ? `${r.prompt_template_code} ${r.prompt_template_version ?? ''}` : 'Instruction not recorded'}
        </p>
      </TableCell>
      <TableCell className="text-xs">
        {r.window_start && r.window_end ? `${r.window_start} to ${r.window_end}` : '—'}
        <p className="text-muted-foreground">{r.citation_count} cited record(s)</p>
      </TableCell>
      <TableCell className="text-xs">
        {r.confidence != null ? r.confidence.toFixed(2) : '—'}
        {r.staleness_state === 'STALE' && <Badge variant="secondary" className="ml-1">Facts changed</Badge>}
      </TableCell>
      <TableCell>
        <Badge variant={REVIEW_STATE_VARIANT[r.review_state] ?? 'outline'}>
          {label(REVIEW_STATE_LABEL, r.review_state)}
        </Badge>
        {r.human_rationale && <p className="mt-1 text-xs text-muted-foreground">{r.human_rationale}</p>}
      </TableCell>
      <TableCell className="text-right text-xs">
        {r.entity_id ? (
          <Button asChild size="sm" variant="ghost">
            <Link to={`/conduct/entities/${r.entity_id}/360`}>Open Conduct 360</Link>
          </Button>
        ) : '—'}
      </TableCell>
    </TableRow>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="AI Activity Register"
          description="Every AI request made or refused across supervision, with the capability, approved model version, instruction version, facts window, citations and the officer's decision. This register is evidence and cannot be edited."
          actions={<Badge variant="outline">Read only</Badge>}
        />

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="text-xs text-muted-foreground">Capability</label>
              <Select value={useCase} onValueChange={(v) => { setUseCase(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All capabilities</SelectItem>
                  {useCases.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Result</label>
              <Select value={outcome} onValueChange={(v) => { setOutcome(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All results</SelectItem>
                  {OUTCOMES.map((o) => <SelectItem key={o} value={o}>{label(OUTCOME_LABEL, o)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Human review</label>
              <Select value={reviewState} onValueChange={(v) => { setReviewState(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All review states</SelectItem>
                  {REVIEW_STATES.map((s) => <SelectItem key={s} value={s}>{label(REVIEW_STATE_LABEL, s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
              </div>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No AI activity matches these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Capability</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Model / instruction version</TableHead>
                      <TableHead>Facts window</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Human review</TableHead>
                      <TableHead className="text-right">Record</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{rows.map(renderRow)}</TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page + 1}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={rows.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
