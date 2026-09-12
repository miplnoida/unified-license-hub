/**
 * MC-08 — Governance → AI Governance → AI surfaces.
 *
 * The platform-wide inventory of every place AI assistance can appear, not just
 * Conduct 360. Each surface states its purpose, what kind of assistance it
 * produces, who reviews it, what writes the authoritative record, and whether it
 * is currently permitted to run. Suspending a surface stops it immediately.
 */
import { useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAiSurfaces, useAiSurfaceTransition, type SurfaceRow } from '@/hooks/useAiGovernance';
import { ADVISORY_CLASS_LABEL, LIFECYCLE_LABEL, LIFECYCLE_VARIANT, label } from '@/lib/aiGovernanceLabels';
import { formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';

export default function AiSurfaces() {
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canGovernPrimary = useCan('ai_management', 'edit');
  const canGovernAlternate = useCan('ai_management', 'approve');
  const canGovern = canGovernPrimary || canGovernAlternate;
  const { data: surfaces = [], isLoading } = useAiSurfaces();
  const transition = useAiSurfaceTransition();

  const [target, setTarget] = useState<{ surface: SurfaceRow; toState: string } | null>(null);
  const [reason, setReason] = useState('');

  const reasonMissing = reason.trim().length < 10;

  const submit = () => {
    if (!target || reasonMissing) return;
    transition.mutate(
      { code: target.surface.code, toState: target.toState, rationale: reason.trim() },
      { onSuccess: () => { setTarget(null); setReason(''); } },
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="AI surfaces"
          description="Every AI-assisted capability across the platform, its governance state, and the control to stop it."
        />

        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Suspending a surface stops AI assistance there at once. Existing records, decisions and audit history are
            unaffected — the surface simply refuses new AI requests until it is reinstated.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Inventory</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading AI surfaces…
              </p>
            ) : surfaces.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No AI surface is registered.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Surface</TableHead>
                      <TableHead>Owning area</TableHead>
                      <TableHead>Assistance type</TableHead>
                      <TableHead>Human review</TableHead>
                      <TableHead>Authoritative record written by</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead className="text-right">Control</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {surfaces.map((s) => {
                      const suspended = s.lifecycle_state === 'SUSPENDED' || s.production_status === 'SUSPENDED';
                      return (
                        <TableRow key={s.code}>
                          <TableCell className="text-sm">
                            <p className="font-medium">{s.label}</p>
                            <p className="max-w-md text-xs text-muted-foreground">{s.business_purpose}</p>
                          </TableCell>
                          <TableCell className="text-xs">{s.owning_module}</TableCell>
                          <TableCell className="text-xs">
                            {label(ADVISORY_CLASS_LABEL, s.advisory_classification)}
                          </TableCell>
                          <TableCell className="text-xs">{s.human_review}</TableCell>
                          <TableCell className="text-xs">{s.authoritative_write_path}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant={LIFECYCLE_VARIANT[s.lifecycle_state] ?? 'outline'}>
                              {label(LIFECYCLE_LABEL, s.lifecycle_state)}
                            </Badge>
                            {suspended && s.suspension_reason && (
                              <p className="mt-1 max-w-xs text-xs text-muted-foreground">{s.suspension_reason}</p>
                            )}
                            {suspended && s.suspended_at && (
                              <p className="text-xs text-muted-foreground">{formatDateTime(s.suspended_at)}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canGovern ? (
                              suspended ? (
                                <GuardedButton module="ai_management" action="edit" data-rbac="ai_management.edit" size="sm" variant="outline"
                                  onClick={() => { setTarget({ surface: s, toState: 'ACTIVE' }); setReason(''); }}>
                                  Reinstate
                                </GuardedButton>
                              ) : (
                                <GuardedButton module="ai_management" action="edit" data-rbac="ai_management.edit" size="sm" variant="destructive"
                                  onClick={() => { setTarget({ surface: s, toState: 'SUSPENDED' }); setReason(''); }}>
                                  Suspend
                                </GuardedButton>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">View only</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setTarget(null); setReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.toState === 'SUSPENDED' ? 'Suspend AI assistance' : 'Reinstate AI assistance'} — {target?.surface.label}
            </DialogTitle>
            <DialogDescription>
              {target?.toState === 'SUSPENDED'
                ? 'AI requests on this surface will be refused from the moment this is recorded.'
                : 'AI assistance becomes available on this surface again, under the same governance controls.'}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="surface-reason">Reason <span className="text-destructive">*</span></Label>
            <Textarea id="surface-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Record why this decision is being taken. This is retained in the governance record." />
            {reasonMissing && <p className="mt-1 text-xs text-destructive">A reason of at least 10 characters is required.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={transition.isPending}>Cancel</Button>
            <Button data-rbac="ai_management.edit" onClick={submit} disabled={reasonMissing || transition.isPending}>
              {transition.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
