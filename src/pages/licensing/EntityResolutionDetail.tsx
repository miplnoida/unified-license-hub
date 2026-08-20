/**
 * RDM-ENTITY-001 Wave A — Entity Resolution case review.
 *
 * All decisions go through `entity_resolution_decide` / `entity_merge_*`; the
 * server records provenance, audit and the resulting entity binding. The UI
 * only gathers the officer's intent and mandatory rationale.
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, ShieldCheck, Merge, AlertTriangle, FileQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { useResolutionCase, useResolutionMutations } from '@/hooks/useEntityRegistry';
import type { ResolutionAction } from '@/services/entityRegistry';
import { useCan } from '@/hooks/useCan';
import { formatDateTime } from '@/lib/datetime';

export default function EntityResolutionDetail() {
  const { caseId = '' } = useParams();
  const { data, isLoading } = useResolutionCase(caseId || null);
  const { decide, previewMerge, executeMerge } = useResolutionMutations();
  const canResolve = useCan('entity_resolution', 'resolve');
  const canEscalate = useCan('entity_resolution', 'escalate');
  const canMerge = useCan('entity_resolution', 'merge');

  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [preview, setPreview] = useState<Record<string, number> | null>(null);

  const detail = data?.detail;
  const candidates = data?.candidates ?? [];
  const events = data?.events ?? [];
  const isClosed = !!detail && ['RESOLVED', 'REJECTED', 'CLOSED'].includes(detail.status);

  const run = async (action: ResolutionAction, entityId?: string | null) => {
    if (notes.trim().length < 10) {
      toast.error('Please record a rationale of at least 10 characters.');
      return;
    }
    try {
      await decide.mutateAsync({ caseId, action, entityId: entityId ?? null, notes: notes.trim() });
      toast.success(`Case ${action.replace(/_/g, ' ').toLowerCase()} recorded.`);
      setNotes('');
    } catch (e) {
      toast.error((e as Error).message || 'Decision failed.');
    }
  };

  const doPreview = async () => {
    if (!detail?.resolved_entity_id || !selectedEntity) {
      toast.error('Select the surviving entity and a duplicate to merge.');
      return;
    }
    try {
      const res = await previewMerge.mutateAsync({
        survivorEntityId: detail.resolved_entity_id,
        absorbedEntityId: selectedEntity,
      });
      setPreview(res);
    } catch (e) {
      toast.error((e as Error).message || 'Merge preview failed.');
    }
  };

  const doMerge = async () => {
    if (!detail?.resolved_entity_id || !selectedEntity) return;
    if (mergeReason.trim().length < 10) {
      toast.error('A merge reason of at least 10 characters is required.');
      return;
    }
    try {
      await executeMerge.mutateAsync({
        survivorEntityId: detail.resolved_entity_id,
        absorbedEntityId: selectedEntity,
        reason: mergeReason.trim(),
        caseId,
      });
      toast.success('Entities merged. Lineage preserved on the surviving record.');
      setPreview(null);
      setMergeReason('');
    } catch (e) {
      toast.error((e as Error).message || 'Merge failed.');
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
      </DashboardLayout>
    );
  }

  if (!detail) {
    return (
      <DashboardLayout>
        <PageHeader title="Resolution case" description="Case not found or not visible to you." backHref="/licensing/entity-resolution" backLabel="Back to queue" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title={`Resolution case ${detail.case_number}`}
          description={detail.subject_name}
          backHref="/licensing/entity-resolution"
          backLabel="Back to queue"
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-base">Match candidates</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No candidates were returned — the subject appears to be a new entity.
                </p>
              )}
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedEntity(c.entity_id)}
                  className={`w-full rounded-md border p-3 text-left transition ${
                    selectedEntity === c.entity_id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{c.entity_id}</span>
                    <Badge variant="outline">{Math.round(Number(c.match_score) * 100)}% · {c.match_basis}</Badge>
                  </div>
                  {c.is_selected && <p className="text-xs text-emerald-700 mt-1">Selected on this case</p>}
                </button>
              ))}

              <Separator className="my-3" />

              <div className="space-y-2">
                <Label htmlFor="rationale">Decision rationale (recorded in the audit trail)</Label>
                <Textarea
                  id="rationale"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Explain the identity evidence relied upon."
                  disabled={isClosed}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={!canResolve || isClosed || !selectedEntity || decide.isPending}
                    onClick={() => run('RESOLVE_EXISTING', selectedEntity)}
                  >
                    <ShieldCheck className="h-4 w-4" /> Resolve to selected entity
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canResolve || isClosed || decide.isPending}
                    onClick={() => run('CONFIRM_NEW')}
                  >
                    Confirm as new entity
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!canResolve || isClosed || decide.isPending}
                    onClick={() => run('REQUEST_EVIDENCE')}
                  >
                    <FileQuestion className="h-4 w-4" /> Request evidence
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!canEscalate || isClosed || decide.isPending}
                    onClick={() => run('ESCALATE')}
                  >
                    <AlertTriangle className="h-4 w-4" /> Escalate
                  </Button>
                </div>
                {isClosed && (
                  <p className="text-xs text-muted-foreground">
                    This case is {detail.status.toLowerCase()} — no further decisions can be recorded.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Case</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline">{detail.status}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Outcome</span><span>{detail.outcome || 'pending'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Provider</span><span>{detail.provider_status}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Authority mode</span><span>{detail.authority_mode}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Requested</span><span>{formatDateTime(detail.requested_at)}</span></div>
                {detail.resolved_at && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Resolved</span><span>{formatDateTime(detail.resolved_at)}</span></div>
                )}
                {detail.resolved_entity_id && (
                  <div>
                    <p className="text-muted-foreground text-xs">Resolved entity</p>
                    <p className="font-mono text-xs break-all">{detail.resolved_entity_id}</p>
                  </div>
                )}
                {detail.decision_notes && (
                  <div>
                    <p className="text-muted-foreground text-xs">Decision notes</p>
                    <p>{detail.decision_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {canMerge && detail.resolved_entity_id && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Merge className="h-4 w-4" /> Controlled merge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground text-xs">
                    Merges the selected candidate into the resolved entity. Lineage is preserved — the
                    absorbed record stays queryable and points at the survivor.
                  </p>
                  <Button size="sm" variant="outline" onClick={doPreview} disabled={!selectedEntity || previewMerge.isPending}>
                    Preview impact
                  </Button>
                  {preview && (
                    <div className="rounded border p-2 space-y-1">
                      {Object.entries(preview).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Textarea
                    value={mergeReason}
                    onChange={(e) => setMergeReason(e.target.value)}
                    rows={2}
                    placeholder="Merge reason (required)"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={doMerge}
                    disabled={!selectedEntity || executeMerge.isPending}
                  >
                    Execute merge
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">History</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {events.length === 0 && <p className="text-sm text-muted-foreground">No events recorded.</p>}
                {events.map((e) => (
                  <div key={e.id} className="rounded border p-2 text-xs">
                    <p className="font-medium">{e.event_type}</p>
                    <p className="text-muted-foreground">{formatDateTime(e.created_at)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
