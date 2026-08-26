/**
 * MC-09 — Emerging conduct risk register.
 *
 * A risk only exists here because a supervisor decided to record it. Nothing is
 * created by the platform, by a rule or by AI. Severity, systemic potential and
 * status are always the outcome of a recorded human assessment.
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, ArrowRight, Search } from 'lucide-react';
import { useCan } from '@/hooks/useCan';
import { formatDate } from '@/lib/datetime';
import {
  CONFIDENCE_LABEL, RISK_STATUS_LABEL, SEVERITY_LABEL, SYSTEMIC_LABEL,
  riskErrorMessage, useEmergingRisks, type EmergingRiskStatus,
} from '@/hooks/useConductEmergingRisk';

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'IDENTIFIED', label: 'Identified' },
  { key: 'ASSESSING', label: 'Under assessment' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'MONITORING', label: 'Under monitoring' },
  { key: 'DISMISSED', label: 'Dismissed' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'all', label: 'All' },
];

const SEVERITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  critical: 'destructive', high: 'destructive', medium: 'default', low: 'secondary',
};

const OPEN_STATES: EmergingRiskStatus[] = ['IDENTIFIED', 'ASSESSING', 'CONFIRMED', 'MONITORING'];

export default function EmergingRisksRegister() {
  const navigate = useNavigate();
  const canComplaints = useCan('market_conduct', 'manage_complaints');
  const canAnalytics = useCan('market_conduct', 'run_conduct_analytics');
  const canOperate = canComplaints || canAnalytics;

  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('all');
  const [systemic, setSystemic] = useState('all');
  const [search, setSearch] = useState('');

  const { data: risks = [], isLoading, isError, error } = useEmergingRisks();

  const visible = useMemo(() => risks.filter((r) => {
    if (status === 'open' && !OPEN_STATES.includes(r.status)) return false;
    if (status !== 'open' && status !== 'all' && r.status !== status) return false;
    if (severity !== 'all' && r.severity !== severity) return false;
    if (systemic !== 'all' && r.systemic_potential !== systemic) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${r.reference} ${r.title} ${r.thematic_scope}`.toLowerCase().includes(q)) return false;
    return true;
  }), [risks, status, severity, systemic, search]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Emerging Conduct Risks"
          description="Risks a supervisor has judged worth tracking across entities. Every entry, severity, systemic view and status change on this register is a recorded human decision — nothing is raised, rated or escalated automatically."
          actions={canOperate ? undefined : <Badge variant="outline">View only</Badge>}
        />

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">Risks are raised from the intelligence workspace</AlertTitle>
          <AlertDescription className="text-xs">
            Open Supervisory Intelligence, review the recorded position for a theme, and raise a risk from there so the
            factual basis is captured with it.{' '}
            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate('/conduct/supervisory-intelligence')}>
              Go to Supervisory Intelligence
            </Button>
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="space-y-4 p-4">
            <Tabs value={status} onValueChange={setStatus}>
              <TabsList className="flex-wrap">
                {STATUS_TABS.map((t) => (
                  <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search reference, title or theme"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any severity</SelectItem>
                  {Object.entries(SEVERITY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={systemic} onValueChange={setSystemic}>
                <SelectTrigger><SelectValue placeholder="Systemic potential" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any systemic potential</SelectItem>
                  {Object.entries(SYSTEMIC_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">The register could not be loaded</AlertTitle>
            <AlertDescription className="text-xs">
              {riskErrorMessage(String((error as Error)?.message ?? ''))}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : visible.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No emerging conduct risk matches the current view.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Theme</TableHead>
                    <TableHead className="text-right">Entities</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Systemic potential</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recorded</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/conduct/emerging-risks/${r.id}`)}
                    >
                      <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                      <TableCell className="max-w-[22rem] truncate text-sm font-medium">{r.title}</TableCell>
                      <TableCell className="text-xs">{r.thematic_scope}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.entity_count}</TableCell>
                      <TableCell>
                        <Badge variant={SEVERITY_VARIANT[r.severity] ?? 'outline'}>
                          {SEVERITY_LABEL[r.severity] ?? r.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{SYSTEMIC_LABEL[r.systemic_potential] ?? r.systemic_potential}</TableCell>
                      <TableCell className="text-xs">{CONFIDENCE_LABEL[r.confidence] ?? r.confidence}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{RISK_STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(r.created_at)}</TableCell>
                      <TableCell>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
