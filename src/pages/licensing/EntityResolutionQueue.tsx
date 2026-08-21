/**
 * RDM-ENTITY-001 — canonical Entity Resolution queue.
 * Route: `/licensing/entity-resolution` (module `entity_resolution`).
 *
 * This is the ONLY queue for identity resolution work. Escalated cases awaiting
 * a supervisory decision are surfaced here with the officer recommendation,
 * recommended organisation, match strength and escalation age so a supervisor
 * can see immediately what needs their decision.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, GitCompareArrows, ArrowRight, Gavel } from 'lucide-react';
import { useResolutionQueue } from '@/hooks/useEntityRegistry';
import type { ResolutionQueueRow } from '@/services/entityRegistry';
import { formatDateTime } from '@/lib/datetime';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PENDING_REVIEW', label: 'Awaiting review' },
  { value: 'EVIDENCE_REQUESTED', label: 'Evidence requested' },
  { value: 'ESCALATED', label: 'Awaiting supervisor decision' },
  { value: 'RESOLVED', label: 'Resolution complete' },
];

const OUTCOME_LABEL: Record<string, string> = {
  EXACT_MATCH: 'Exact match',
  POSSIBLE_MATCH: 'Possible match',
  NO_MATCH: 'No match',
  PROVIDER_UNAVAILABLE: 'Register unavailable',
  RESOLVED_EXISTING: 'Resolved to existing organisation',
  CONFIRMED_NEW: 'Confirmed as new organisation',
  MERGED: 'Merged',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  PENDING_REVIEW: 'Awaiting review',
  EVIDENCE_REQUESTED: 'Evidence requested',
  ESCALATED: 'Awaiting supervisor decision',
  RESOLVED: 'Resolution complete',
  CLOSED: 'Closed',
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  RESOLVE_EXISTING: 'Recommended existing organisation',
  CONFIRM_NEW: 'Recommended new organisation',
};

const OUTCOME_TONE = (o: string | null) => {
  switch ((o || '').toUpperCase()) {
    case 'EXACT_MATCH':
    case 'RESOLVED_EXISTING':
    case 'CONFIRMED_NEW': return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
    case 'POSSIBLE_MATCH': return 'bg-amber-500/10 text-amber-700 border-amber-200';
    case 'NO_MATCH': return 'bg-blue-500/10 text-blue-700 border-blue-200';
    case 'PROVIDER_UNAVAILABLE': return 'bg-destructive/10 text-destructive border-destructive/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const scoreLabel = (v: number | null) =>
  v === null || v === undefined ? '—' : `${Math.round(Number(v) <= 1 ? Number(v) * 100 : Number(v))}%`;

const ageLabel = (hours: number | null) => {
  if (hours === null || hours === undefined) return '—';
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`;
};

export default function EntityResolutionQueue() {
  const [status, setStatus] = useState('all');
  const { data, isLoading, error } = useResolutionQueue(status);

  const rows = (data?.rows ?? []) as ResolutionQueueRow[];
  const awaitingSupervisor = data?.awaiting_supervisor_count ?? 0;
  const isEscalatedView = status === 'ESCALATED';

  const counts = useMemo(
    () => ({
      total: rows.length,
      possible: rows.filter((r) => r.outcome === 'POSSIBLE_MATCH').length,
    }),
    [rows],
  );

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Entity Resolution"
          description="Review identity matches raised during registration and licence issuance before an entity record is created."
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Cases in view</p>
            <p className="text-2xl font-semibold">{counts.total}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Possible matches</p>
            <p className="text-2xl font-semibold">{counts.possible}</p>
          </CardContent></Card>
          <Card className={awaitingSupervisor > 0 ? 'border-amber-300' : undefined}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Gavel className="h-3.5 w-3.5" /> Awaiting supervisor decision
            </p>
            <p className="text-2xl font-semibold">{awaitingSupervisor}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4" /> Resolution queue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Tabs value={status} onValueChange={setStatus}>
              <TabsList className="flex-wrap h-auto">
                {STATUS_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                    {t.label}
                    {t.value === 'ESCALATED' && awaitingSupervisor > 0 && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200">
                        {awaitingSupervisor}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Applicant / subject</TableHead>
                    <TableHead>Journey</TableHead>
                    <TableHead>Recommendation</TableHead>
                    <TableHead>Recommended organisation</TableHead>
                    <TableHead className="text-right">Match</TableHead>
                    <TableHead>Recommending officer</TableHead>
                    {isEscalatedView && <TableHead>Escalated by</TableHead>}
                    {isEscalatedView && <TableHead className="text-right">Escalation age</TableHead>}
                    <TableHead>Status</TableHead>
                    {!isEscalatedView && <TableHead>Requested</TableHead>}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={12} className="py-8 text-center">
                      <Loader2 className="h-5 w-5 animate-spin inline" />
                    </TableCell></TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                      No resolution cases in this view.
                    </TableCell></TableRow>
                  )}
                  {rows.map((c) => (
                    <TableRow key={c.id} className={c.awaiting_supervisor ? 'bg-amber-500/5' : undefined}>
                      <TableCell className="font-mono text-xs">{c.case_number}</TableCell>
                      <TableCell className="font-medium">{c.subject_name}</TableCell>
                      <TableCell className="text-xs">
                        {c.journey_type === 'FORM_FIRST' ? 'New applicant' : c.journey_type === 'ENTITY_FIRST' ? 'Existing organisation' : '—'}
                        {c.registration_reference && (
                          <span className="block font-mono text-[11px] text-muted-foreground">{c.registration_reference}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.recommended_action
                          ? RECOMMENDATION_LABEL[c.recommended_action] ?? c.recommended_action
                          : <span className="text-muted-foreground">Not yet recommended</span>}
                      </TableCell>
                      <TableCell className="text-xs">{c.recommended_entity_name || '—'}</TableCell>
                      <TableCell className="text-right text-xs">{scoreLabel(c.top_match_score)}</TableCell>
                      <TableCell className="text-xs">{c.recommended_by_name || '—'}</TableCell>
                      {isEscalatedView && <TableCell className="text-xs">{c.escalated_by_name || '—'}</TableCell>}
                      {isEscalatedView && <TableCell className="text-right text-xs">{ageLabel(c.escalation_age_hours)}</TableCell>}
                      <TableCell>
                        <Badge variant="outline" className={OUTCOME_TONE(c.outcome ?? c.status)}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </Badge>
                        {c.outcome && (
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            {OUTCOME_LABEL[c.outcome] ?? c.outcome}
                          </span>
                        )}
                      </TableCell>
                      {!isEscalatedView && <TableCell className="text-xs">{formatDateTime(c.requested_at)}</TableCell>}
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild className="gap-1">
                          <Link to={`/licensing/entity-resolution/${c.id}`}>
                            Review <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
