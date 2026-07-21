import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchClearances, upsertClearance,
  fetchDisagreements, raiseDisagreement, resolveDisagreement,
  type TwinPeaksClearance, type TwinPeaksRole, type TwinPeaksStatus,
} from '@/lib/twinPeaksClearance';
import { logAction } from '@/hooks/useAuditLog';

const STATUS_META: Record<TwinPeaksStatus, { label: string; variant: any; icon: any }> = {
  pending: { label: 'Pending', variant: 'outline', icon: ShieldQuestion },
  clear: { label: 'Clear', variant: 'secondary', icon: ShieldCheck },
  conditional: { label: 'Conditional', variant: 'default', icon: ShieldQuestion },
  blocked: { label: 'Blocked', variant: 'destructive', icon: ShieldAlert },
};

interface Props {
  applicationId: string;
}

export function TwinPeaksPanel({ applicationId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: clearances = [] } = useQuery({
    queryKey: ['twinpeaks_clearances', applicationId],
    queryFn: () => fetchClearances(applicationId),
  });
  const { data: disagreements = [] } = useQuery({
    queryKey: ['twinpeaks_disagreements', applicationId],
    queryFn: () => fetchDisagreements(applicationId),
  });

  const byRole = useMemo(() => {
    const map: Record<TwinPeaksRole, TwinPeaksClearance | undefined> = { prudential: undefined, conduct: undefined };
    for (const c of clearances) map[c.regulator_role] = c;
    return map;
  }, [clearances]);

  const [editRole, setEditRole] = useState<TwinPeaksRole | null>(null);
  const [status, setStatus] = useState<TwinPeaksStatus>('clear');
  const [rationale, setRationale] = useState('');
  const [conditions, setConditions] = useState('');
  const [newDisagreement, setNewDisagreement] = useState('');
  const [resolveText, setResolveText] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async () => {
      if (!editRole) return;
      if (status === 'conditional' && conditions.trim().length === 0) throw new Error('Conditions required');
      if ((status === 'blocked' || status === 'conditional') && rationale.trim().length < 10) {
        throw new Error('Rationale required (min 10 chars)');
      }
      const rec = await upsertClearance({
        application_id: applicationId,
        regulator_role: editRole,
        status,
        conditions: conditions.split('\n').map((s) => s.trim()).filter(Boolean),
        rationale: rationale.trim() || null,
        recorded_by: user?.id,
      });
      await logAction('twinpeaks.clearance_recorded', 'application', applicationId, {
        after: { regulator_role: editRole, status, clearance_id: rec.id },
      });
    },
    onSuccess: () => {
      toast.success('Clearance recorded');
      setEditRole(null); setRationale(''); setConditions(''); setStatus('clear');
      qc.invalidateQueries({ queryKey: ['twinpeaks_clearances', applicationId] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed'),
  });

  const raise = useMutation({
    mutationFn: async () => {
      if (newDisagreement.trim().length < 15) throw new Error('Describe the disagreement (min 15 chars)');
      const rec = await raiseDisagreement({
        application_id: applicationId,
        description: newDisagreement.trim(),
        raised_by: user?.id,
      });
      await logAction('twinpeaks.disagreement_raised', 'application', applicationId, {
        after: { disagreement_id: rec.id },
      });
    },
    onSuccess: () => {
      toast.success('Disagreement recorded');
      setNewDisagreement('');
      qc.invalidateQueries({ queryKey: ['twinpeaks_disagreements', applicationId] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed'),
  });

  const resolve = useMutation({
    mutationFn: async ({ id, resolution }: { id: string; resolution: string }) => {
      if (resolution.trim().length < 10) throw new Error('Resolution rationale required (min 10 chars)');
      await resolveDisagreement({ id, resolution: resolution.trim(), resolved_by: user?.id });
      await logAction('twinpeaks.disagreement_resolved', 'application', applicationId, {
        after: { disagreement_id: id },
      });
    },
    onSuccess: () => {
      toast.success('Disagreement resolved');
      setResolveText({});
      qc.invalidateQueries({ queryKey: ['twinpeaks_disagreements', applicationId] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed'),
  });

  const openBlocked = clearances.some((c) => c.status === 'blocked');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4" /> Twin-Peaks Clearance
          {openBlocked && <Badge variant="destructive" className="ml-2">Approval blocked</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(['prudential', 'conduct'] as TwinPeaksRole[]).map((role) => {
            const c = byRole[role];
            const meta = STATUS_META[c?.status ?? 'pending'];
            const Icon = meta.icon;
            return (
              <div key={role} className="border rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium capitalize">{role} regulator</div>
                  <Badge variant={meta.variant}><Icon className="h-3 w-3 mr-1" />{meta.label}</Badge>
                </div>
                {c?.rationale && <div className="text-xs text-muted-foreground italic">{c.rationale}</div>}
                {c?.conditions?.length ? (
                  <ul className="text-xs list-disc pl-4">
                    {c.conditions.map((cond, i) => <li key={i}>{cond}</li>)}
                  </ul>
                ) : null}
                {c?.recorded_at && (
                  <div className="text-xs text-muted-foreground">
                    Recorded {new Date(c.recorded_at).toLocaleString()}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditRole(role);
                    setStatus(c?.status ?? 'clear');
                    setRationale(c?.rationale ?? '');
                    setConditions((c?.conditions ?? []).join('\n'));
                  }}
                >
                  {c ? 'Update clearance' : 'Record clearance'}
                </Button>
              </div>
            );
          })}
        </div>

        {editRole && (
          <div className="border rounded p-3 space-y-2 bg-muted/30">
            <div className="text-sm font-medium capitalize">Record {editRole} clearance</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as TwinPeaksStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="clear">Clear</SelectItem>
                    <SelectItem value="conditional">Conditional</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Rationale {status !== 'clear' && status !== 'pending' && '(required, min 10)'}</Label>
                <Input value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Conditions (one per line){status === 'conditional' ? ' — required' : ''}</Label>
              <Textarea rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditRole(null)}>Cancel</Button>
              <Button data-rbac="application_management.edit" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
              </Button>
            </div>
          </div>
        )}

        <div className="border-t pt-3 space-y-3">
          <div className="text-sm font-medium">Disagreements</div>
          <div className="flex gap-2">
            <Textarea rows={2} placeholder="Describe divergence between regulators…"
              value={newDisagreement} onChange={(e) => setNewDisagreement(e.target.value)} />
            <Button data-rbac="application_management.edit" size="sm" onClick={() => raise.mutate()} disabled={raise.isPending}>
              {raise.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Raise
            </Button>
          </div>
          {disagreements.length === 0 && <p className="text-xs text-muted-foreground">No disagreements recorded.</p>}
          {disagreements.map((d) => (
            <div key={d.id} className="border rounded p-2 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={d.status === 'open' ? 'destructive' : 'secondary'}>{d.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  Raised {new Date(d.raised_at).toLocaleString()}
                </span>
              </div>
              <div className="text-sm">{d.description}</div>
              {d.resolution && (
                <div className="text-xs italic text-muted-foreground">Resolution: {d.resolution}</div>
              )}
              {d.status === 'open' && (
                <div className="flex gap-2 pt-1">
                  <Input placeholder="Resolution rationale (min 10 chars)"
                    value={resolveText[d.id] ?? ''}
                    onChange={(e) => setResolveText((p) => ({ ...p, [d.id]: e.target.value }))} />
                  <Button data-rbac="application_management.edit" size="sm" variant="outline" onClick={() => resolve.mutate({ id: d.id, resolution: resolveText[d.id] ?? '' })}>
                    Resolve
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default TwinPeaksPanel;
