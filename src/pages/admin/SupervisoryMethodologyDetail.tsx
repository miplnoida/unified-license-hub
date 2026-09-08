/**
 * Supervisory Methodology detail workspace.
 *
 * A review workspace, not an editor: it inspects one methodology version's
 * content, semantics, evidence expectations, materiality parameters, reference
 * decisions, regulator approval register and audit trail, and offers only the
 * governed actions the server says this actor may take.
 */
import { useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  useSupervisoryMethodology,
  useSupervisoryMethodologyGovernance,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import {
  ErrorPanel, Field, OriginBadge, StatusBadge, formatDate,
} from '@/components/admin/supervisory-methodology/labels';
import { MethodologyActionBar } from '@/components/admin/supervisory-methodology/MethodologyActionBar';
import { OverviewTab } from '@/components/admin/supervisory-methodology/tabs/OverviewTab';
import { QuestionsTab } from '@/components/admin/supervisory-methodology/tabs/QuestionsTab';
import { SemanticsTab } from '@/components/admin/supervisory-methodology/tabs/SemanticsTab';
import { FactsTab } from '@/components/admin/supervisory-methodology/tabs/FactsTab';
import { ParametersTab } from '@/components/admin/supervisory-methodology/tabs/ParametersTab';
import { ReferenceDecisionsTab } from '@/components/admin/supervisory-methodology/tabs/ReferenceDecisionsTab';
import { ApprovalsTab } from '@/components/admin/supervisory-methodology/tabs/ApprovalsTab';
import { AuditTab } from '@/components/admin/supervisory-methodology/tabs/AuditTab';
import { CompareTab } from '@/components/admin/supervisory-methodology/tabs/CompareTab';
import { ValidationTab } from '@/components/admin/supervisory-methodology/tabs/ValidationTab';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'questions', label: 'Dimensions & Questions' },
  { value: 'semantics', label: 'Response Semantics' },
  { value: 'facts', label: 'Evidence & Facts' },
  { value: 'parameters', label: 'Parameters' },
  { value: 'validation', label: 'Validation' },
  { value: 'decisions', label: 'Reference Decisions' },
  { value: 'approval', label: 'Regulator Approval' },
  { value: 'audit', label: 'Audit History' },
  { value: 'compare', label: 'Compare' },
];


export default function SupervisoryMethodologyDetailPage() {
  const { methodologyId } = useParams<{ methodologyId: string }>();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';

  const detail = useSupervisoryMethodology(methodologyId);
  const { readiness, capabilities } = useSupervisoryMethodologyGovernance(methodologyId);

  if (detail.isLoading) return <Skeleton className="h-96 w-full" />;
  if (detail.error) return <ErrorPanel error={detail.error} title="This methodology could not be opened" />;
  const m = detail.data;
  if (!m) return <ErrorPanel error={new Error('not found')} title="This methodology could not be found" />;

  const lineage = m.adopted_from
    ? `Adopted from ${m.adopted_from.code} v${m.adopted_from.version} (${m.adopted_from.origin_label})`
    : m.supersedes
      ? `Supersedes ${m.supersedes.code} v${m.supersedes.version}`
      : 'No lineage recorded';

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${m.name ?? m.code} · v${m.version}`}
        description={m.code}
        backHref="/admin/supervisory-methodology"
        backLabel="Supervisory Methodology"
        breadcrumbLabel={`${m.code} v${m.version}`}
        actions={<MethodologyActionBar methodology={m} capabilities={capabilities.data} isLoading={capabilities.isLoading} />}
      />

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={m.status} />
            <OriginBadge origin={m.origin} label={m.origin_label} />
            <Badge variant="outline">{m.domain_code}</Badge>
            {m.regulator ? <Badge variant="secondary">{m.regulator.name}</Badge> : <Badge variant="outline">Not regulator-owned</Badge>}
          </div>
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Applicability">{m.sector_summary ?? 'All sectors'}</Field>
            <Field label="Entity types">{m.entity_types?.length ? m.entity_types.join(', ') : 'All entity types'}</Field>
            <Field label="Effective period">{formatDate(m.effective_from)} → {m.effective_to ? formatDate(m.effective_to) : 'open'}</Field>
            <Field label="Assessment frequency">{m.assessment_frequency_months ? `${m.assessment_frequency_months} months` : '—'}</Field>
            <Field label="Dimensions">{m.counts?.dimensions ?? 0}</Field>
            <Field label="Questions">{m.counts?.questions ?? 0}</Field>
            <Field label="Lineage">{lineage}</Field>
            <Field label="Last updated">{formatDate(m.updated_at)}</Field>
          </dl>
          {m.adoptions?.length ? (
            <p className="text-xs text-muted-foreground">
              Adopted by: {m.adoptions.map((a) => `${a.regulator_name ?? 'Unnamed regulator'} (v${a.version}, ${a.status})`).join('; ')}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (v === 'overview') next.delete('tab'); else next.set('tab', v);
        return next;
      }, { replace: true })}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            detail={m}
            readiness={readiness.data}
            readinessLoading={readiness.isLoading}
            readinessError={readiness.error}
          />
        </TabsContent>
        <TabsContent value="questions" className="mt-4"><QuestionsTab methodologyId={m.id} /></TabsContent>
        <TabsContent value="semantics" className="mt-4"><SemanticsTab methodologyId={m.id} /></TabsContent>
        <TabsContent value="facts" className="mt-4"><FactsTab methodologyId={m.id} /></TabsContent>
        <TabsContent value="parameters" className="mt-4"><ParametersTab methodologyId={m.id} /></TabsContent>
        <TabsContent value="decisions" className="mt-4"><ReferenceDecisionsTab methodologyId={m.id} /></TabsContent>
        <TabsContent value="approval" className="mt-4"><ApprovalsTab methodologyId={m.id} /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab methodologyId={m.id} /></TabsContent>
        <TabsContent value="compare" className="mt-4"><CompareTab methodologyId={m.id} /></TabsContent>
      </Tabs>
    </div>
  );
}
