import { useMemo, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, Download, ChevronRight, GitCommit } from 'lucide-react';
import {
  buildRelatedGraph, fetchCaseTimeline, ENTITY_KIND_LABELS, isKind,
  type EntityKind, type TimelineEvent,
} from '@/lib/caseAuditGraph';
import { DiffViewer } from '@/components/audit/DiffViewer';
import { logExport } from '@/lib/exportAudit';

const KIND_COLOR: Record<string, string> = {
  application: 'bg-primary/10 text-primary border-primary/30',
  licensee: 'bg-info/10 text-info border-info/30',
  license: 'bg-success/10 text-success border-success/30',
  fp_individual: 'bg-purple-100 text-purple-700 border-purple-200',
  fp_assessment: 'bg-purple-100 text-purple-700 border-purple-200',
  complaint: 'bg-amber-100 text-amber-700 border-amber-200',
  enforcement_action: 'bg-destructive/15 text-destructive border-destructive/30',
  return: 'bg-blue-100 text-blue-700 border-blue-200',
  system: 'bg-muted text-muted-foreground border-muted',
};

export default function CaseAuditTrail() {
  const { entityType, entityId } = useParams<{ entityType?: string; entityId?: string }>();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [inputKind, setInputKind] = useState<EntityKind>(
    isKind(entityType ?? '') ? (entityType as EntityKind) : 'application',
  );
  const [inputId, setInputId] = useState(entityId ?? sp.get('id') ?? '');

  const activeKind = isKind(entityType ?? '') ? (entityType as EntityKind) : null;
  const activeId = entityId ?? sp.get('id') ?? '';

  const { data: graph = [], isFetching: graphLoading } = useQuery({
    queryKey: ['case-audit-graph', activeKind, activeId],
    enabled: !!activeKind && !!activeId,
    queryFn: async () => buildRelatedGraph({ kind: activeKind!, id: activeId }),
  });

  const { data: events = [], isLoading, isFetching } = useQuery({
    queryKey: ['case-audit-events', graph.map((g) => `${g.kind}:${g.id}`).join(',')],
    enabled: graph.length > 0,
    queryFn: async () => fetchCaseTimeline(graph),
  });

  const grouped = useMemo(() => {
    const m = new Map<string, TimelineEvent[]>();
    events.forEach((e) => {
      const day = e.at.slice(0, 10);
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(e);
    });
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [events]);

  const load = () => {
    if (!inputId.trim()) return;
    nav(`/admin/case-audit/${inputKind}/${inputId.trim()}`);
  };

  const exportJson = async () => {
    if (events.length === 0) return;
    const payload = JSON.stringify({ root: { kind: activeKind, id: activeId }, graph, events }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `case-audit-${activeKind}-${activeId}.json`;
    a.click(); URL.revokeObjectURL(url);
    await logExport({
      dataset: 'case_audit_trail', format: 'json',
      rowCount: events.length, moduleKey: 'settings',
      filters: { root_kind: activeKind, root_id: activeId, related: graph.length },
      payload,
    });
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Case Audit Trail"
        description="Chronological cross-module timeline for a single case — licensing, F&P, prudential, conduct, enforcement — merged into one legally-defensible view."
      />

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" />Load a case</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Entity type</Label>
            <Select value={inputKind} onValueChange={(v) => setInputKind(v as EntityKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ENTITY_KIND_LABELS) as (EntityKind | 'system')[])
                  .filter((k) => k !== 'system')
                  .map((k) => <SelectItem key={k} value={k}>{ENTITY_KIND_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3">
            <Label>Entity ID</Label>
            <Input value={inputId} onChange={(e) => setInputId(e.target.value)} placeholder="UUID" onKeyDown={(e) => e.key === 'Enter' && load()} />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={load} disabled={!inputId.trim()}>Load</Button>
          </div>
        </CardContent>
      </Card>

      {activeKind && activeId && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Related entities</CardTitle>
              <p className="text-xs text-muted-foreground">Automatically discovered via foreign-key joins.</p>
            </div>
            <Button data-rbac="audit_management.export" size="sm" onClick={exportJson} disabled={events.length === 0}>
              <Download className="h-3 w-3 mr-1" />Export JSON
            </Button>
          </CardHeader>
          <CardContent>
            {graphLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="flex flex-wrap gap-2">
                {graph.map((g) => (
                  <Badge key={`${g.kind}-${g.id}`} variant="outline" className={KIND_COLOR[g.kind] ?? ''}>
                    {ENTITY_KIND_LABELS[g.kind]}: <span className="font-mono text-[10px] ml-1">{g.id.slice(0, 8)}</span>
                  </Badge>
                ))}
                {graph.length === 0 && <span className="text-xs text-muted-foreground">No related entities found.</span>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Timeline ({events.length} events)</CardTitle>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
        </CardHeader>
        <CardContent>
          {isLoading && graph.length > 0 && <div className="text-sm text-muted-foreground flex gap-2 items-center"><Loader2 className="h-4 w-4 animate-spin" />Loading timeline…</div>}
          {!isLoading && grouped.length === 0 && (
            <p className="text-sm text-muted-foreground">Load a case above to see its cross-module timeline.</p>
          )}
          <div className="space-y-6">
            {grouped.map(([day, dayEvents]) => (
              <div key={day}>
                <div className="text-xs uppercase text-muted-foreground border-b pb-1 mb-2">{day}</div>
                <div className="space-y-2">
                  {dayEvents.map((e, i) => (
                    <div key={`${e.source}-${e.entityId}-${i}`} className="flex items-start gap-3 border rounded p-3">
                      <GitCommit className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant="outline" className={KIND_COLOR[e.entityKind] ?? ''}>{ENTITY_KIND_LABELS[e.entityKind]}</Badge>
                          <Badge variant="outline" className="text-[10px]">{e.module}</Badge>
                          <span className="font-medium">{e.action}</span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{e.actor ?? 'system'}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{e.entityId}</div>
                        {(e.before || e.after) && (
                          <div className="mt-2">
                            <DiffViewer before={e.before} after={e.after} compact />
                          </div>
                        )}
                        {e.detail !== undefined && e.detail !== null && !e.before && !e.after && (
                          <pre className="text-[10px] mt-1 bg-muted rounded p-1 max-h-24 overflow-auto">
                            {typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
