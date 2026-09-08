/**
 * Supervisory Policy Profile detail workspace.
 *
 * Read-only regulator-facing view of one policy profile plus its governed
 * actions. Authority, readiness and lifecycle come from the server; the browser
 * decides nothing. Policy profiles govern configuration only in this release —
 * operational assessments still resolve their own methodology version.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  useSupervisoryPolicyProfile,
  useSupervisoryPolicyProfileCompare,
  useSupervisoryPolicyProfileEvents,
  useSupervisoryPolicyProfileGovernance,
} from '@/hooks/useSupervisoryPolicyProfiles';
import { PolicyProfileActionBar } from '@/components/admin/supervisory-policy-profile/PolicyProfileActionBar';
import { PolicyComponentPanel } from '@/components/admin/supervisory-policy-profile/PolicyComponentPanel';
import {
  EmptyPanel, ErrorPanel, Field, ProfileOriginBadge, ProfileStatusBadge, RequirementBadge,
  formatDate, formatDateTime, humanize,
} from '@/components/admin/supervisory-policy-profile/labels';

export default function SupervisoryPolicyProfileDetailPage() {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const [baselineId, setBaselineId] = useState<string>('');

  const detail = useSupervisoryPolicyProfile(profileId);
  const { readiness, capabilities } = useSupervisoryPolicyProfileGovernance(profileId);
  const events = useSupervisoryPolicyProfileEvents(profileId);
  const compare = useSupervisoryPolicyProfileCompare(profileId, baselineId || undefined);

  if (detail.isLoading) return <Skeleton className="h-96 w-full" />;
  if (detail.error) return <ErrorPanel error={detail.error} title="This policy profile could not be opened" />;
  const p = detail.data;
  if (!p) return <EmptyPanel title="This policy profile no longer exists." />;

  const r = readiness.data ?? p.readiness;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate('/admin/supervisory-policy-profiles')}>
        <ArrowLeft className="h-4 w-4" />All policy profiles
      </Button>

      <PageHeader
        title={`${p.code} · ${p.profile_version}`}
        description={p.title ?? p.name}
        actions={
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <ProfileStatusBadge status={p.status} />
              <ProfileOriginBadge origin={p.origin} label={p.origin_label} />
            </div>
            <PolicyProfileActionBar
              profile={{ ...p, readiness: r }}
              capabilities={capabilities.data}
              isLoading={capabilities.isLoading}
              onNavigate={(id) => navigate(`/admin/supervisory-policy-profiles/${id}`)}
            />
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Supervisory domain">{humanize(p.domain_code)}</Field>
                <Field label="Regulator">{p.regulator_name ?? 'Not regulator-owned'}</Field>
                <Field label="Effective period">
                  <span className="font-mono text-xs">
                    {p.effective_from ? formatDate(p.effective_from) : '—'} → {p.effective_to ? formatDate(p.effective_to) : 'open'}
                  </span>
                </Field>
                <Field label="Prepared by">{p.created_by_name ?? '—'}</Field>
                <Field label="Submitted for review by">
                  {p.reviewed_by_name ?? '—'}{p.reviewed_at ? ` · ${formatDateTime(p.reviewed_at)}` : ''}
                </Field>
                <Field label="Approved by">
                  {p.approved_by_name ?? 'No approval recorded'}{p.approved_at ? ` · ${formatDateTime(p.approved_at)}` : ''}
                </Field>
                <Field label="Adopted from">
                  {p.adopted_from ? `${p.adopted_from.code} · ${p.adopted_from.profile_version}` : '—'}
                </Field>
                <Field label="Supersedes">
                  {p.supersedes ? `${p.supersedes.code} · ${p.supersedes.profile_version}` : '—'}
                </Field>
                <Field label="Activated">{p.activated_at ? formatDateTime(p.activated_at) : '—'}</Field>
                <div className="sm:col-span-3">
                  <Field label="Purpose">{p.purpose ?? 'Not recorded'}</Field>
                </div>
              </dl>
              <p className="mt-4 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                Policy profiles govern configuration. In this release, live assessments continue to resolve their own
                methodology version; profile activation does not re-point work already in progress.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="components" className="pt-4">
          {readiness.error ? <ErrorPanel error={readiness.error} /> : (
            <PolicyComponentPanel profileId={p.id} readiness={r} capabilities={capabilities.data} />
          )}
        </TabsContent>

        <TabsContent value="compare" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Compare with another version</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {p.sibling_versions.length === 0 ? (
                <EmptyPanel title="No other version of this profile exists yet." />
              ) : (
                <>
                  <Select value={baselineId} onValueChange={setBaselineId}>
                    <SelectTrigger className="w-[18rem]" aria-label="Baseline version">
                      <SelectValue placeholder="Select a version to compare against" />
                    </SelectTrigger>
                    <SelectContent>
                      {p.sibling_versions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.profile_version} · {humanize(s.status)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {compare.error ? <ErrorPanel error={compare.error} /> : compare.data ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        {compare.data.changed_count === 0
                          ? 'No component difference between these two versions.'
                          : `${compare.data.changed_count} component difference${compare.data.changed_count === 1 ? '' : 's'}.`}
                      </p>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Component</TableHead>
                              <TableHead>{compare.data.baseline.profile_version}</TableHead>
                              <TableHead>{compare.data.subject.profile_version}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {compare.data.components.map((c) => (
                              <TableRow key={c.component_type} className={c.binding_changed || c.requirement_changed ? 'bg-warning/5' : undefined}>
                                <TableCell className="text-sm">{c.label}</TableCell>
                                <TableCell className="text-xs">
                                  <RequirementBadge requirement={c.baseline_requirement} />
                                  <div className="mt-1 font-mono">
                                    {c.baseline_component ? `${c.baseline_component.component_code} · ${c.baseline_component.component_version}` : '—'}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs">
                                  <RequirementBadge requirement={c.subject_requirement} />
                                  <div className="mt-1 font-mono">
                                    {c.subject_component ? `${c.subject_component.component_code} · ${c.subject_component.component_version}` : '—'}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Governance history</CardTitle></CardHeader>
            <CardContent>
              {events.error ? <ErrorPanel error={events.error} /> : events.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : !events.data?.rows.length ? (
                <EmptyPanel title="No history recorded yet." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Status change</TableHead>
                        <TableHead>Officer</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.data.rows.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(e.created_at)}</TableCell>
                          <TableCell className="text-sm">{humanize(e.event_type)}</TableCell>
                          <TableCell className="text-xs">
                            {e.from_status || e.to_status ? `${humanize(e.from_status) || '—'} → ${humanize(e.to_status) || '—'}` : '—'}
                          </TableCell>
                          <TableCell className="text-sm">{e.actor_name ?? '—'}</TableCell>
                          <TableCell className="max-w-sm text-xs text-muted-foreground">{e.rationale ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
