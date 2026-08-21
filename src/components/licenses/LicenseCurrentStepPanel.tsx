/**
 * P04 — Current Step: the ONLY surface that advances the licence lifecycle.
 *
 * The available actions, their eligibility and the recommended next action all
 * come from the `license_case` read model; the panel only submits the chosen
 * governed operation (`license_lifecycle_action`) with a rationale.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/datetime';
import {
  useLicenseLifecycleAction,
  type LicenseCaseModel,
  type LicenseLifecycleActionKey,
} from '@/hooks/useLicenseLifecycle';

interface ActionDef {
  key: LicenseLifecycleActionKey;
  label: string;
  permission: string;
  adverse?: boolean;
}

const ADVERSE_KEYS: LicenseLifecycleActionKey[] = [
  'REFUSE_RENEWAL', 'BEGIN_SUSPENSION', 'SUSPEND', 'BEGIN_REVOCATION', 'REVOKE', 'ACCEPT_SURRENDER', 'MARK_EXPIRED',
];

/**
 * Client-side list only narrows which governed operations are *offered*; the
 * server re-validates permission, from-state and rationale on every call.
 */
function offeredActions(model: LicenseCaseModel): ActionDef[] {
  const h = model.header;
  const openMatter = model.open_matter?.matter_kind ?? null;
  const openRenewal = (model.renewals ?? []).some(
    (r) => !['approved', 'refused', 'withdrawn'].includes(String((r as { status?: string }).status ?? '')),
  );
  const out: ActionDef[] = [];

  if (['revoked', 'surrendered'].includes(h.status)) return out;

  if (openRenewal) {
    out.push({ key: 'REQUEST_RENEWAL_INFORMATION', label: 'Request renewal information', permission: 'license_management.workflow_action' });
    out.push({ key: 'APPROVE_RENEWAL', label: 'Approve renewal', permission: 'license_management.approve' });
    out.push({ key: 'REFUSE_RENEWAL', label: 'Refuse renewal', permission: 'license_management.approve', adverse: true });
  } else if (['active', 'restricted', 'expired'].includes(h.status)) {
    out.push({ key: 'START_RENEWAL', label: 'Start renewal', permission: 'license_management.workflow_action' });
  }

  if (openMatter === 'variation') {
    out.push({ key: 'APPROVE_VARIATION', label: 'Approve variation', permission: 'license_management.approve' });
  } else if (h.status === 'active') {
    out.push({ key: 'APPLY_VARIATION', label: 'Open variation matter', permission: 'license_management.workflow_action' });
  }

  if (h.status === 'suspended') {
    out.push({ key: 'REINSTATE', label: 'Reinstate licence', permission: 'license_management.manage_license_actions' });
  } else if (['active', 'restricted'].includes(h.status)) {
    if (openMatter === 'suspension') {
      out.push({ key: 'SUSPEND', label: 'Suspend licence', permission: 'license_management.manage_license_actions', adverse: true });
    } else {
      out.push({ key: 'BEGIN_SUSPENSION', label: 'Begin suspension review', permission: 'license_management.manage_license_actions', adverse: true });
    }
  }

  if (openMatter === 'revocation') {
    out.push({ key: 'REVOKE', label: 'Revoke licence', permission: 'license_management.manage_license_actions', adverse: true });
  } else if (!['revoked', 'surrendered'].includes(h.status)) {
    out.push({ key: 'BEGIN_REVOCATION', label: 'Begin revocation review', permission: 'license_management.manage_license_actions', adverse: true });
  }

  if (openMatter === 'surrender') {
    out.push({ key: 'ACCEPT_SURRENDER', label: 'Accept surrender', permission: 'license_management.manage_license_actions', adverse: true });
  } else {
    out.push({ key: 'BEGIN_SURRENDER', label: 'Open surrender matter', permission: 'license_management.workflow_action' });
  }

  if (h.sla_state === 'breached' && h.status === 'active') {
    out.push({ key: 'MARK_EXPIRED', label: 'Mark expired', permission: 'license_management.manage_license_actions', adverse: true });
  }

  return out;
}

export function LicenseCurrentStepPanel({ model, readOnly }: { model: LicenseCaseModel; readOnly?: boolean }) {
  const actions = useMemo(() => offeredActions(model), [model]);
  const recommended = model.header.next_action?.key ?? null;
  const [selected, setSelected] = useState<string>('');
  const [reason, setReason] = useState('');
  const mutation = useLicenseLifecycleAction(model.header.license_id);

  const chosen = actions.find((a) => a.key === selected) ?? null;
  const adverse = chosen ? ADVERSE_KEYS.includes(chosen.key) : false;
  const reasonTooShort = adverse && reason.trim().length < 10;

  const submit = async () => {
    if (!chosen) return;
    try {
      await mutation.mutateAsync({ actionKey: chosen.key, reason: reason.trim() || null });
      toast({ title: 'Lifecycle action recorded', description: chosen.label });
      setSelected('');
      setReason('');
    } catch (error) {
      const message = (error as { message?: string })?.message ?? 'Action failed';
      toast({
        variant: 'destructive',
        title: 'Action rejected',
        description:
          message.includes('REASON_REQUIRED') ? 'A rationale of at least 10 characters is required.'
          : message.includes('INVALID_FROM_STATE') ? 'The licence is not in a valid state for this action.'
          : message.includes('RENEWAL_ALREADY_OPEN') ? 'A renewal is already open for this licence.'
          : message.includes('NO_OPEN_RENEWAL') ? 'There is no open renewal to decide.'
          : message,
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Current step
          <Badge variant="outline" className="text-xs">{model.header.stage}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Recommended next action</p>
            <p className="font-medium">{model.header.next_action?.label ?? 'No action required'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Priority</p>
            <p className="font-medium capitalize">{model.header.priority}{model.header.priority_reason ? ` — ${model.header.priority_reason}` : ''}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Renewal window</p>
            <p className="font-medium">{model.policy.renewal_window_days} days · term {model.policy.period_days} days</p>
          </div>
        </div>

        {model.open_matter && (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium capitalize">{model.open_matter.matter_kind.replace('_', ' ')} matter open</p>
            <p className="text-muted-foreground text-xs">
              Opened {formatDateTime(model.open_matter.opened_at)} · waiting on {model.open_matter.waiting_on}
              {model.open_matter.reason ? ` · ${model.open_matter.reason}` : ''}
            </p>
          </div>
        )}

        {(model.header.blockers ?? []).length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
            {model.header.blockers.map((b) => (
              <p key={b.key} className="text-sm flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />{b.label}
              </p>
            ))}
          </div>
        )}

        {readOnly || model.audience === 'external' ? (
          <p className="text-sm text-muted-foreground">Lifecycle actions are performed by the regulator.</p>
        ) : actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">This licence is closed — no lifecycle actions are available.</p>
        ) : (
          <div className="space-y-3">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="max-w-md"><SelectValue placeholder="Select a lifecycle action" /></SelectTrigger>
              <SelectContent>
                {actions.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label}{recommended === a.key ? ' (recommended)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {chosen && (
              <>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder={adverse ? 'Rationale (min 10 characters) — required for adverse actions' : 'Rationale (optional)'}
                />
                <div className="flex items-center gap-3">
                  <Button
                    data-rbac={chosen.permission}
                    onClick={submit}
                    disabled={mutation.isPending || reasonTooShort}
                  >
                    {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                    {chosen.label}
                  </Button>
                  {reasonTooShort && (
                    <span className="text-xs text-muted-foreground">Rationale must be at least 10 characters.</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LicenseCurrentStepPanel;
