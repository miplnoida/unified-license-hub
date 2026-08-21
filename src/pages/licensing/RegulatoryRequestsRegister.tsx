/**
 * Regulatory Requests register (/licensing/regulatory-requests).
 *
 * Cross-entity view of post-licence regulatory requests. Status transitions
 * remain governed by `regulatory_request_transition`; this screen only reads
 * and routes to the owning entity workspace.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Loader2, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/datetime';
import { useRegulatoryRequests } from '@/hooks/useWaveB';
import { useEntityNames } from '@/hooks/useEntityNames';

const STATUS_TABS = [
  { value: 'open', label: 'Open', statuses: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUESTED'] },
  { value: 'decided', label: 'Decided', statuses: ['APPROVED', 'REJECTED'] },
  { value: 'closed', label: 'Closed', statuses: ['CLOSED', 'WITHDRAWN'] },
  { value: 'all', label: 'All', statuses: [] as string[] },
];

const STATUS_VARIANT: Record<string, 'outline' | 'secondary' | 'destructive' | 'default'> = {
  DRAFT: 'outline',
  SUBMITTED: 'secondary',
  UNDER_REVIEW: 'secondary',
  INFORMATION_REQUESTED: 'default',
  APPROVED: 'default',
  REJECTED: 'destructive',
  CLOSED: 'outline',
  WITHDRAWN: 'outline',
};

export default function RegulatoryRequestsRegister() {
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const { data: requests = [], isLoading, isError, error } = useRegulatoryRequests(null);

  const entityIds = useMemo(
    () => Array.from(new Set(requests.map((r) => r.entity_id as string).filter(Boolean))),
    [requests],
  );
  const { data: entityNames = {} } = useEntityNames(entityIds);

  const rows = useMemo(() => {
    const statuses = STATUS_TABS.find((t) => t.value === tab)?.statuses ?? [];
    const term = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statuses.length && !statuses.includes(String(r.status))) return false;
      if (!term) return true;
      const label = String(r.regulatory_request_types?.label ?? '');
      const name = entityNames[r.entity_id as string] ?? '';
      return (
        String(r.request_number).toLowerCase().includes(term) ||
        label.toLowerCase().includes(term) ||
        name.toLowerCase().includes(term)
      );
    });
  }, [requests, tab, search, entityNames]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Regulatory Requests"
          description="Post-licence requests raised by regulated entities — notifications, approvals and change requests."
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-2">
                {t.label}
                <Badge variant="secondary" className="text-xs">
                  {t.statuses.length
                    ? requests.filter((r) => t.statuses.includes(String(r.status))).length
                    : requests.length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base">{rows.length} request{rows.length === 1 ? '' : 's'}</CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search request, type or entity"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
              </div>
            ) : isError ? (
              <div className="flex items-center gap-2 p-6 text-destructive">
                <AlertTriangle className="h-4 w-4" /> {(error as { message?: string })?.message ?? 'Failed to load requests'}
              </div>
            ) : rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No regulatory requests in this view.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request #</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Last update</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id as string}>
                        <TableCell className="font-mono text-xs">{r.request_number as string}</TableCell>
                        <TableCell className="text-sm">
                          {r.entity_id ? (
                            <Link to={`/entities/${r.entity_id}`} className="text-primary hover:underline">
                              {entityNames[r.entity_id as string] ?? 'Entity'}
                            </Link>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-sm">{r.regulatory_request_types?.label ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[String(r.status)] ?? 'outline'} className="text-xs">
                            {String(r.status).replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.effective_date ? new Date(r.effective_date as string).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.submitted_at ? formatDateTime(r.submitted_at as string) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(r.updated_at as string)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/entities/${r.entity_id}/structure?tab=requests&request=${r.id}`}>
                              <ExternalLink className="h-4 w-4 mr-1" />Open
                            </Link>
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
      </div>
    </DashboardLayout>
  );
}
