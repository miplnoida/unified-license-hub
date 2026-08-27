/**
 * MC-10 — Supervisory intervention register.
 *
 * Every entry exists because an officer proposed it with a written basis, and
 * every state on it is the outcome of a recorded human decision. Nothing here
 * is raised, approved or closed automatically.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, ArrowRight, Search } from 'lucide-react';
import { formatDate } from '@/lib/datetime';
import {
  INTERVENTION_STATUS_LABEL, INTERVENTION_TYPE_LABEL, planningErrorMessage, useInterventions,
} from '@/hooks/useConductPlanning';

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'PROPOSED', label: 'Awaiting decision' },
  { key: 'ENDORSED', label: 'Endorsed' },
  { key: 'ACTIVE', label: 'In progress' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'REJECTED', label: 'Not approved' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

const OPEN = ['PROPOSED', 'ENDORSED', 'ACTIVE'];

const VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  PROPOSED: 'default', ENDORSED: 'default', ACTIVE: 'default',
  COMPLETED: 'secondary', REJECTED: 'destructive', CANCELLED: 'outline',
};

export default function InterventionsRegister() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const { data = [], isLoading, isError, error } = useInterventions();

  const rows = useMemo(() => data.filter((r) => {
    if (tab === 'open' && !OPEN.includes(r.status)) return false;
    if (tab !== 'open' && tab !== 'all' && r.status !== tab) return false;
    const q = search.trim().toLowerCase();
    return !q || `${r.reference} ${r.title} ${r.theme ?? ''}`.toLowerCase().includes(q);
  }), [data, tab, search]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Supervisory Interventions"
          description="Planned supervisory action arising from recorded conduct facts. Each proposal carries a written basis and must be decided by a different officer with approval authority."
          actions={
            <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={() => navigate('/conduct/prioritisation')}>
              Prioritisation
            </Button>
          }
        />

        <Card>
          <CardContent className="space-y-4 p-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex-wrap">
                {TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search reference, title or theme"
                     value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">The register could not be loaded</AlertTitle>
            <AlertDescription className="text-xs">
              {planningErrorMessage(String((error as Error)?.message ?? ''))}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Intervention</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Proposed</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          No interventions in this view.
                        </TableCell>
                      </TableRow>
                    )}
                    {rows.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer"
                                onClick={() => navigate(`/conduct/interventions/${r.id}`)}>
                        <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                        <TableCell>
                          <p className="font-medium">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {INTERVENTION_TYPE_LABEL[r.intervention_type] ?? r.intervention_type}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs">{r.theme ?? (r.licensee_id ? 'Entity' : '—')}</TableCell>
                        <TableCell>
                          <Badge variant={VARIANT[r.status] ?? 'outline'}>
                            {INTERVENTION_STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(r.proposed_at)}</TableCell>
                        <TableCell className="text-right">
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
