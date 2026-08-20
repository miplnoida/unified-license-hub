/**
 * RDM-ENTITY-001 Wave A — Entity Resolution workspace queue.
 * Route: `/licensing/entity-resolution` (module `entity_resolution`).
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
import { Loader2, GitCompareArrows, ArrowRight } from 'lucide-react';
import { useResolutionCases, type ResolutionCaseRow } from '@/hooks/useEntityRegistry';
import { formatDateTime } from '@/lib/datetime';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'RESOLVED', label: 'Resolved' },
];

const OUTCOME_TONE = (o: string | null) => {
  switch ((o || '').toUpperCase()) {
    case 'EXACT_MATCH': return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
    case 'POSSIBLE_MATCH': return 'bg-amber-500/10 text-amber-700 border-amber-200';
    case 'NO_MATCH': return 'bg-blue-500/10 text-blue-700 border-blue-200';
    case 'PROVIDER_UNAVAILABLE': return 'bg-destructive/10 text-destructive border-destructive/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

export default function EntityResolutionQueue() {
  const [status, setStatus] = useState('all');
  const { data = [], isLoading, error } = useResolutionCases(status);

  const counts = useMemo(() => {
    const rows = data as ResolutionCaseRow[];
    return {
      total: rows.length,
      possible: rows.filter((r) => r.outcome === 'POSSIBLE_MATCH').length,
      escalated: rows.filter((r) => r.status === 'ESCALATED').length,
    };
  }, [data]);

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
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Escalated</p>
            <p className="text-2xl font-semibold">{counts.escalated}</p>
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
                  <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Subject name</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center">
                      <Loader2 className="h-5 w-5 animate-spin inline" />
                    </TableCell></TableRow>
                  )}
                  {!isLoading && (data as ResolutionCaseRow[]).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No resolution cases in this view.
                    </TableCell></TableRow>
                  )}
                  {(data as ResolutionCaseRow[]).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.case_number}</TableCell>
                      <TableCell className="font-medium">{c.subject_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={OUTCOME_TONE(c.outcome)}>
                          {c.outcome || 'pending'}
                        </Badge>
                      </TableCell>
                      <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.provider_status}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(c.requested_at)}</TableCell>
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
