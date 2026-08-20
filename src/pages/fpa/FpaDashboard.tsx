import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFpaDashboardMetrics } from '@/hooks/useFpaDashboardMetrics';
import {
  Loader2, Users, ClipboardList, AlertTriangle, ShieldCheck,
  ArrowRight, Zap, Eye, Search, FileText, CheckSquare,
  TrendingUp, Brain, Layers, Gavel, SlidersHorizontal,
  Scale, GitBranch, Timer, Megaphone, Activity,
} from 'lucide-react';

// ─── Stat card types ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  isError: boolean;
  icon: React.ReactNode;
  accentClass: string;
  subLabel?: string;
}

function StatCard({ label, value, isLoading, isError, icon, accentClass, subLabel }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {isLoading ? (
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground inline" />
              ) : isError ? (
                <AlertTriangle className="h-6 w-6 text-destructive inline" />
              ) : (
                value ?? 0
              )}
            </p>
            {isError ? (
              <p className="text-xs text-destructive mt-1">Failed to load</p>
            ) : (
              subLabel && <p className="text-xs text-muted-foreground mt-1">{subLabel}</p>
            )}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accentClass}`}>
            {icon}
          </div>
        </div>
      </CardContent>
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${accentClass.replace('bg-', 'bg-').replace('/10', '')}`} />
    </Card>
  );
}

// ─── Scenario card types ─────────────────────────────────────────────────────

interface Scenario {
  id: string;
  title: string;
  description: string;
  route: string;
  icon: React.ReactNode;
}

interface ScenarioCardProps {
  scenario: Scenario;
  borderColor: string;
  badgeClass: string;
}

function ScenarioCard({ scenario, borderColor, badgeClass }: ScenarioCardProps) {
  const isPatternRoute = scenario.route.includes(':');
  return (
    <Card className={`border-l-4 ${borderColor} transition-shadow hover:shadow-md group`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${badgeClass}`}>
                {scenario.icon}
              </span>
            </div>

            <h3 className="font-semibold text-sm text-foreground leading-snug">{scenario.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{scenario.description}</p>
          </div>
        </div>
        <div className="mt-3">
          {isPatternRoute ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" disabled className="h-7 px-3 text-xs gap-1.5">
                  View
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Select an individual from the Individual Register to view their profile</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button asChild size="sm" variant="outline" className="h-7 px-3 text-xs gap-1.5 group-hover:border-primary/50 group-hover:text-primary transition-colors">
              <Link to={scenario.route}>
                View
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Assessment type banner item ─────────────────────────────────────────────

interface AssessmentTypeBucket {
  type: string;
  count: number;
  total: number;
}

function AssessmentTypeBar({ bucket }: { bucket: AssessmentTypeBucket }) {
  const pct = bucket.total > 0 ? Math.round((bucket.count / bucket.total) * 100) : 0;
  const label = bucket.type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-foreground w-8 text-right">{bucket.count}</span>
    </div>
  );
}

// ─── Scenario definitions ─────────────────────────────────────────────────────

const STAGE_1_AREAS: Scenario[] = [
  {
    id: 'FPA-001',
    title: 'Initiation Pathways',
    description: '4 assessment initiation types: New Licence, Ongoing Monitor, Ad-hoc, Cycle-Based',
    route: '/fpa/initiation',
    icon: <Zap className="h-3.5 w-3.5" />,
  },
  {
    id: 'FPA-002',
    title: 'Individual Register',
    description: 'Register individuals, detect duplicates, manage multi-role flags',
    route: '/fpa/individuals',
    icon: <Users className="h-3.5 w-3.5" />,
  },
  {
    id: 'FPA-003',
    title: 'Subject Profile',
    description: 'Full subject profile with access control and role history — open an individual record to view',
    route: '/fpa/individuals/:id',
    icon: <Eye className="h-3.5 w-3.5" />,
  },
];

const STAGE_2_AREAS: Scenario[] = [
  {
    id: 'FPA-004',
    title: 'Declarations',
    description: 'Send declarations, track notification delivery, manage responses',
    route: '/fpa/declarations',
    icon: <FileText className="h-3.5 w-3.5" />,
  },
  {
    id: 'FPA-005',
    title: 'Screening Hub',
    description: 'Configure checks, run automated adverse media and sanctions screening',
    route: '/fpa/screening',
    icon: <Search className="h-3.5 w-3.5" />,
  },
  {
    id: 'FPA-006',
    title: 'Manual Review Queue',
    description: 'Manual screening tasks with evidence upload and outcome recording',
    route: '/fpa/manual-tasks',
    icon: <CheckSquare className="h-3.5 w-3.5" />,
  },
];

const STAGE_3_AREAS: Scenario[] = [
  {
    id: 'FPA-007',
    title: 'Findings Console',
    description: 'Severity-coded findings with supervisor routing and escalation',
    route: '/fpa/findings',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  {
    id: 'FPA-008',
    title: 'Trends & History',
    description: 'Historical finding trends and population comparison analytics',
    route: '/fpa/trends',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
  },
];

const STAGE_4_AREAS: Scenario[] = [
  {
    id: 'FPA-009',
    title: 'AI Analysis',
    description: 'AI-generated analysis with human override and confidence scoring',
    route: '/fpa/ai-analysis',
    icon: <Brain className="h-3.5 w-3.5" />,
  },
  {
    id: 'FPA-010',
    title: 'Sector Rules',
    description: 'Sector-specific decision rules and role-type criteria',
    route: '/fpa/sector-rules',
    icon: <Layers className="h-3.5 w-3.5" />,
  },
  {
    id: 'FPA-011',
    title: 'Multi-Regulator',
    description: 'Side-by-side determinations across multiple regulators',
    route: '/fpa/determinations',
    icon: <GitBranch className="h-3.5 w-3.5" />,
  },
  {
    id: 'FPA-012',
    title: 'Committee Voting',
    description: 'Weighted voting with quorum tracking and outcome calculation',
    route: '/fpa/committee',
    icon: <Gavel className="h-3.5 w-3.5" />,
  },
  {
    id: 'FPA-013',
    title: 'Conditions & SLA',
    description: 'Conditional determinations with SLA breach monitoring',
    route: '/fpa/conditions',
    icon: <Timer className="h-3.5 w-3.5" />,
  },
];

const STAGE_5_AREAS: Scenario[] = [
  {
    id: 'FPA-014',
    title: 'Appeals',
    description: 'Appeal management with license impact and timeline tracking',
    route: '/fpa/appeals',
    icon: <Scale className="h-3.5 w-3.5" />,
  },
  {
    id: 'FPA-015',
    title: 'Monitoring & Audit',
    description: 'Monitoring event stream and full compliance audit trail',
    route: '/fpa/monitoring',
    icon: <Activity className="h-3.5 w-3.5" />,
  },
];

// ─── Theme configs per tab ────────────────────────────────────────────────────

const THEME = {
  A: {
    border: 'border-l-blue-500',
    badge: 'border-blue-200 text-blue-700 bg-blue-50',
    label: 'text-blue-600',
    dot: 'bg-blue-500',
  },
  B: {
    border: 'border-l-purple-500',
    badge: 'border-purple-200 text-purple-700 bg-purple-50',
    label: 'text-purple-600',
    dot: 'bg-purple-500',
  },
  C: {
    border: 'border-l-red-500',
    badge: 'border-red-200 text-red-700 bg-red-50',
    label: 'text-red-600',
    dot: 'bg-red-500',
  },
  D: {
    border: 'border-l-green-500',
    badge: 'border-green-200 text-green-700 bg-green-50',
    label: 'text-green-600',
    dot: 'bg-green-500',
  },
  E: {
    border: 'border-l-amber-500',
    badge: 'border-amber-200 text-amber-700 bg-amber-50',
    label: 'text-amber-600',
    dot: 'bg-amber-500',
  },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FpaDashboard() {
  const { data: fpaMetrics, isLoading: loadingFpaMetrics, isError: isErrorFpaMetrics } = useFpaDashboardMetrics();
  const individualsCount = fpaMetrics?.individuals;
  const activeAssessments = fpaMetrics?.activeAssessments;
  const openFindings = fpaMetrics?.openFindings;
  const activeConditions = fpaMetrics?.activeConditions;
  const assessmentTypeData = fpaMetrics?.assessmentTypeData;
  const loadingIndividuals = loadingFpaMetrics;
  const loadingAssessments = loadingFpaMetrics;
  const loadingFindings = loadingFpaMetrics;
  const loadingConditions = loadingFpaMetrics;
  const loadingTypeData = loadingFpaMetrics;
  const isErrorIndividuals = isErrorFpaMetrics;
  const isErrorAssessments = isErrorFpaMetrics;
  const isErrorFindings = isErrorFpaMetrics;
  const isErrorConditions = isErrorFpaMetrics;
  const isErrorTypeData = isErrorFpaMetrics;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Fit & Proper Assessment Hub"
          description="The full fit and proper lifecycle — initiation, declarations and screening, adverse findings, determination, appeals and ongoing monitoring"
        />


        {/* ── Stats row ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Individuals"
            value={individualsCount as number | undefined}
            isLoading={loadingIndividuals}
            isError={isErrorIndividuals}
            icon={<Users className="h-5 w-5 text-blue-600" />}
            accentClass="bg-blue-50 text-blue-600"
            subLabel="Registered subjects"
          />
          <StatCard
            label="Active Assessments"
            value={activeAssessments as number | undefined}
            isLoading={loadingAssessments}
            isError={isErrorAssessments}
            icon={<ClipboardList className="h-5 w-5 text-purple-600" />}
            accentClass="bg-purple-50 text-purple-600"
            subLabel="In progress"
          />
          <StatCard
            label="Open Findings"
            value={openFindings as number | undefined}
            isLoading={loadingFindings}
            isError={isErrorFindings}
            icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
            accentClass="bg-red-50 text-red-600"
            subLabel="Pending resolution"
          />
          <StatCard
            label="Active Conditions"
            value={activeConditions as number | undefined}
            isLoading={loadingConditions}
            isError={isErrorConditions}
            icon={<ShieldCheck className="h-5 w-5 text-green-600" />}
            accentClass="bg-green-50 text-green-600"
            subLabel="Under monitoring"
          />
        </div>

        {/* ── Lifecycle stages ───────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Assessment Lifecycle</h2>
            <Badge variant="secondary" className="text-xs">
              5 stages ·{' '}
              {STAGE_1_AREAS.length + STAGE_2_AREAS.length + STAGE_3_AREAS.length + STAGE_4_AREAS.length + STAGE_5_AREAS.length}{' '}
              work areas
            </Badge>
          </div>

          <Tabs defaultValue="A">
            <TabsList className="h-9 mb-4 gap-1">
              <TabsTrigger value="A" className="text-xs gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                1. Initiation &amp; Register
              </TabsTrigger>
              <TabsTrigger value="B" className="text-xs gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-500 inline-block" />
                2. Declarations &amp; Screening
              </TabsTrigger>
              <TabsTrigger value="C" className="text-xs gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                3. Adverse Findings
              </TabsTrigger>
              <TabsTrigger value="D" className="text-xs gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                4. Determination
              </TabsTrigger>
              <TabsTrigger value="E" className="text-xs gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                5. Appeals &amp; Monitoring
              </TabsTrigger>
            </TabsList>

            {/* Stage 1 – Initiation & Register */}
            <TabsContent value="A">
              <div className="mb-3">
                <p className="text-xs text-muted-foreground">
                  How assessments start and who they are about — initiation pathways, the individual register, and subject profiles.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STAGE_1_AREAS.map((s) => (
                  <ScenarioCard
                    key={s.id}
                    scenario={s}
                    borderColor={THEME.A.border}
                    badgeClass={THEME.A.badge}
                  />
                ))}
              </div>
            </TabsContent>

            {/* Stage 2 – Declarations & Screening */}
            <TabsContent value="B">
              <div className="mb-3">
                <p className="text-xs text-muted-foreground">
                  Collecting declarations from subjects and screening them — automated checks plus the manual review queue.
                </p>

              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STAGE_2_AREAS.map((s) => (
                  <ScenarioCard
                    key={s.id}
                    scenario={s}
                    borderColor={THEME.B.border}
                    badgeClass={THEME.B.badge}
                  />
                ))}
              </div>
            </TabsContent>

            {/* Stage 3 – Adverse Findings */}
            <TabsContent value="C">
              <div className="mb-3">
                <p className="text-xs text-muted-foreground">
                  Adverse findings raised by screening or review — severity, supervisor routing, escalation and historical trends.
                </p>

              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STAGE_3_AREAS.map((s) => (
                  <ScenarioCard
                    key={s.id}
                    scenario={s}
                    borderColor={THEME.C.border}
                    badgeClass={THEME.C.badge}
                  />
                ))}
              </div>
            </TabsContent>

            {/* Stage 4 – Determination */}
            <TabsContent value="D">
              <div className="mb-3">
                <p className="text-xs text-muted-foreground">
                  Reaching and recording the fit and proper determination — analysis support, sector rules, committee voting and conditions.
                </p>

              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STAGE_4_AREAS.map((s) => (
                  <ScenarioCard
                    key={s.id}
                    scenario={s}
                    borderColor={THEME.D.border}
                    badgeClass={THEME.D.badge}
                  />
                ))}
              </div>
            </TabsContent>

            {/* Stage 5 – Appeals & Monitoring */}
            <TabsContent value="E">
              <div className="mb-3">
                <p className="text-xs text-muted-foreground">
                  What happens after a determination — appeals against the decision, ongoing monitoring and the audit trail.
                </p>

              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STAGE_5_AREAS.map((s) => (
                  <ScenarioCard
                    key={s.id}
                    scenario={s}
                    borderColor={THEME.E.border}
                    badgeClass={THEME.E.badge}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Assessment type breakdown banner ───────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-muted-foreground" />
                Assessment Type Breakdown
              </CardTitle>
              {loadingTypeData && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            {isErrorTypeData ? (
              <p className="text-sm text-destructive text-center py-4">
                Failed to load assessment breakdown. Check your connection and permissions.
              </p>
            ) : !loadingTypeData && (!assessmentTypeData || assessmentTypeData.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No assessments recorded yet. Assessments appear here once they are initiated.
              </p>

            ) : (
              <div className="space-y-3">
                {(assessmentTypeData ?? []).map((bucket) => (
                  <AssessmentTypeBar key={bucket.type} bucket={bucket} />
                ))}
              </div>
            )}

            {/* Legend row with all lifecycle stages */}
            <div className="mt-4 pt-3 border-t flex flex-wrap gap-x-4 gap-y-1.5">
              {[
                { key: '1', label: 'Initiation & Register', theme: THEME.A },
                { key: '2', label: 'Declarations & Screening', theme: THEME.B },
                { key: '3', label: 'Adverse Findings', theme: THEME.C },
                { key: '4', label: 'Determination', theme: THEME.D },
                { key: '5', label: 'Appeals & Monitoring', theme: THEME.E },
              ].map(({ key, label, theme }) => (
                <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${theme.dot}`} />
                  Stage {key} — {label}
                </span>
              ))}

            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
