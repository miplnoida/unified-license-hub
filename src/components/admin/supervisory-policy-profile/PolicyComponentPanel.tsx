/**
 * Component binding & readiness panel.
 *
 * Shows the complete component contract of a policy profile: what the domain
 * requires, what is bound to which exact component version, and whether the
 * server considers each one satisfied. Component types the platform has not
 * built yet are shown honestly as unavailable rather than pretended configured.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Link2Off, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
  useClearPolicyComponentBinding,
  useSetPolicyComponentBinding,
  useSetPolicyComponentRequirement,
  useSupervisoryPolicyComponentCandidates,
  type ComponentRequirement,
  type PolicyProfileCapabilities,
  type PolicyProfileReadiness,
} from '@/hooks/useSupervisoryPolicyProfiles';
import { ReadinessBadge, RequirementBadge, errorMessage, formatDateTime } from './labels';

/** Where each policy component type is authored, approved and versioned. */
const COMPONENT_WORKSPACE: Record<string, string> = {
  METHODOLOGY: '/admin/supervisory-methodology',
  CALCULATION_CONFIG: '/admin/supervisory-calculation',
  ASSESSMENT_PROGRAMME: '/admin/supervisory-assessment-programmes',
};

function workspaceHref(componentType: string) {
  return COMPONENT_WORKSPACE[componentType] ?? '/admin/supervisory-policy-components';
}

export function PolicyComponentPanel({
  profileId, readiness, capabilities,
}: {
  profileId: string;
  readiness: PolicyProfileReadiness;
  capabilities?: PolicyProfileCapabilities;
}) {
  const [bindType, setBindType] = useState<string | null>(null);
  const [clearType, setClearType] = useState<string | null>(null);
  const [componentId, setComponentId] = useState('');
  const [rationale, setRationale] = useState('');

  const candidates = useSupervisoryPolicyComponentCandidates(profileId, bindType ?? undefined, !!bindType);
  const bind = useSetPolicyComponentBinding();
  const clear = useClearPolicyComponentBinding();
  const requirement = useSetPolicyComponentRequirement();

  const editable = !!capabilities?.can_bind_components?.allowed;
  const editReason = capabilities?.can_bind_components?.reason;

  const close = () => { setBindType(null); setClearType(null); setComponentId(''); setRationale(''); };

  const submitBind = async () => {
    if (!bindType) return;
    try {
      await bind.mutateAsync({ profileId, componentType: bindType, componentId, rationale });
      toast({ title: 'Component bound', description: 'The exact component version is now part of this profile.' });
      close();
    } catch (e) {
      toast({ title: 'Binding refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const submitClear = async () => {
    if (!clearType) return;
    try {
      await clear.mutateAsync({ profileId, componentType: clearType, rationale });
      toast({ title: 'Binding removed' });
      close();
    } catch (e) {
      toast({ title: 'Action refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  const changeRequirement = async (componentType: string, value: ComponentRequirement) => {
    try {
      await requirement.mutateAsync({ profileId, componentType, requirement: value });
      toast({ title: 'Component requirement updated' });
    } catch (e) {
      toast({ title: 'Action refused', description: errorMessage(e), variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Policy components</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {readiness.satisfied_count} of {readiness.required_count} required components satisfied.
            {readiness.is_ready_for_approval ? ' This profile is ready for the approval decision.' : ''}
          </p>
        </div>
        {!editable && editReason ? <p className="max-w-xs text-right text-xs text-muted-foreground">{editReason}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Bound version</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {readiness.components.map((c) => (
                <TableRow key={c.component_type}>
                  <TableCell className="align-top">
                    <div className="text-sm font-medium">{c.label}</div>
                    {c.detail ? <div className="mt-0.5 text-xs text-muted-foreground">{c.detail}</div> : null}
                  </TableCell>
                  <TableCell className="align-top">
                    {editable && c.is_available && c.requirement_editable ? (
                      <Select value={c.requirement} onValueChange={(v) => changeRequirement(c.component_type, v as ComponentRequirement)}>
                        <SelectTrigger className="h-8 w-[10.5rem]" aria-label={`${c.label} requirement`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="REQUIRED">Required</SelectItem>
                          <SelectItem value="OPTIONAL">Optional</SelectItem>
                          <SelectItem value="NOT_APPLICABLE">Not applicable</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="space-y-1">
                        <RequirementBadge requirement={c.requirement} />
                        {c.domain_requirement_locked ? (
                          <p className="max-w-[13rem] text-xs text-muted-foreground" data-testid={`domain-locked-${c.component_type}`}>
                            Domain requirement{c.domain_requirement_reason ? ` — ${c.domain_requirement_reason}` : ''}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="align-top">
                    {c.bound_component_id ? (
                      <div className="text-xs">
                        <div className="font-mono">{c.bound_component_code} · {c.bound_component_version}</div>
                        <div className="text-muted-foreground">
                          Bound {formatDateTime(c.bound_at)}
                          {c.bound_status_now && c.bound_status_now !== c.bound_status_at_binding
                            ? ` · now ${c.bound_status_now.toLowerCase()}` : ''}
                        </div>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">Nothing bound</span>}
                  </TableCell>
                  <TableCell className="align-top"><ReadinessBadge state={c.state} /></TableCell>
                  <TableCell className="align-top text-right">
                    {c.is_available ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={!editable}
                          data-rbac="aml_supervision.manage_config"
                          onClick={() => { setBindType(c.component_type); setComponentId(c.bound_component_id ?? ''); }}>
                          <Link2 className="h-3.5 w-3.5" />{c.bound_component_id ? 'Change' : 'Bind'}
                        </Button>
                        {c.bound_component_id ? (
                          <Button size="sm" variant="ghost" className="gap-1.5" disabled={!editable}
                            data-rbac="aml_supervision.manage_config"
                            onClick={() => setClearType(c.component_type)}>
                            <Link2Off className="h-3.5 w-3.5" />Remove
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant="ghost" className="gap-1.5" data-rbac="aml_supervision.manage_config">
                          <Link to={workspaceHref(c.component_type)}>
                            <SlidersHorizontal className="h-3.5 w-3.5" />Configure
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Awaiting platform capability</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {readiness.blockers.length ? (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="text-xs font-medium">Outstanding before approval</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
              {readiness.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        ) : null}
      </CardContent>

      {/* ------------------------------------------------------- bind dialog */}
      <Dialog open={!!bindType} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bind a component version</DialogTitle>
            <DialogDescription>
              A profile binds an exact version. Only approved or active component versions within your supervisory scope
              can be bound.
            </DialogDescription>
          </DialogHeader>
          {candidates.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading available versions…</p>
          ) : candidates.error ? (
            <p className="text-sm text-destructive">{errorMessage(candidates.error)}</p>
          ) : !candidates.data?.candidates.length ? (
            <p className="text-sm text-muted-foreground">
              No approved or active version of this component exists for this regulator and domain yet.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pp-component">Component version</Label>
                <Select value={componentId} onValueChange={setComponentId}>
                  <SelectTrigger id="pp-component"><SelectValue placeholder="Select a version" /></SelectTrigger>
                  <SelectContent>
                    {candidates.data.candidates.map((c) => (
                      <SelectItem key={c.component_id} value={c.component_id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pp-bind-rationale">Reason (optional)</Label>
                <Textarea id="pp-bind-rationale" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={submitBind} disabled={!componentId || bind.isPending}>
              {bind.isPending ? 'Binding…' : 'Bind version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------ clear dialog */}
      <Dialog open={!!clearType} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this component binding</DialogTitle>
            <DialogDescription>The profile will no longer name a version for this component. The removal is recorded in its history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pp-clear-rationale">Reason</Label>
            <Textarea id="pp-clear-rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button variant="destructive" onClick={submitClear} disabled={rationale.trim().length < 10 || clear.isPending}>
              {clear.isPending ? 'Removing…' : 'Remove binding'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
