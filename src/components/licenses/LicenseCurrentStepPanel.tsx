/**
 * P04 — Current Step: the ONLY surface that advances the licence lifecycle.
 *
 * Availability, adversity, rationale requirement, due-process blockers AND the
 * payload schema for the chosen step all come from the server
 * (`license_case().available_actions` enriched by
 * `license_adverse_matter_case().actions[].input_requirements`). The panel
 * renders the requested fields and submits them through
 * `license_lifecycle_step`, which re-validates every one of them.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/datetime';
import {
  useLicenseAdverseMatterCase,
  useLicenseLifecycleAction,
  type LicenseCaseModel,
  type LicenseAvailableAction,
  type LicenseActionInputRequirement,
} from '@/hooks/useLicenseLifecycle';

function humanise(message: string): string {
  if (message.includes('REASON_REQUIRED')) return 'A rationale of at least 10 characters is required.';
  if (message.includes('FIELD_REQUIRED')) return message.replace(/^.*FIELD_REQUIRED[^A-Za-z]*/, '') || 'A required field is missing.';
  if (message.includes('INVALID_FROM_STATE')) return 'The licence is not in a valid state for this action.';
  if (message.includes('RENEWAL_ALREADY_OPEN')) return 'A renewal is already open for this licence.';
  if (message.includes('NO_OPEN_RENEWAL')) return 'There is no open renewal to decide.';
  if (message.includes('BLOCKED')) return 'Outstanding due-process blockers must be resolved before this action.';
  if (message.includes('FORBIDDEN')) return 'You do not hold the authority for this action.';
  return message;
}

export function LicenseCurrentStepPanel({ model, readOnly }: { model: LicenseCaseModel; readOnly?: boolean }) {
  const baseActions: LicenseAvailableAction[] = model.header.available_actions ?? model.available_actions ?? [];
  // Server-declared payload schema for adverse/due-process steps.
  const { data: adverseCase } = useLicenseAdverseMatterCase(model.header.license_id);
  const actions = useMemo<LicenseAvailableAction[]>(() => {
    const enriched = adverseCase?.actions ?? [];
    if (!enriched.length) return baseActions;
    return baseActions.map((a) => {
      const match = enriched.find((e) => e.key === a.key && (e.matter_id ?? null) === (a.matter_id ?? null));
      return match ? { ...a, ...match } : a;
    });
  }, [baseActions, adverseCase]);

  const recommended = model.header.next_action?.key ?? null;
  const [selected, setSelected] = useState<string>('');
  const [reason, setReason] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const mutation = useLicenseLifecycleAction(model.header.license_id);

  const chosen = actions.find((a) => `${a.key}:${a.matter_id ?? ''}` === selected) ?? null;
  const requiresReason = chosen?.requires_reason ?? false;
  const reasonTooShort = requiresReason && reason.trim().length < 10;
  const chosenBlockers = chosen?.blockers ?? [];
  const requirements: LicenseActionInputRequirement[] = chosen?.input_requirements ?? [];
  const missingRequired = requirements.filter((r) => r.required && !(fields[r.key] ?? '').trim());

  const submit = async () => {
    if (!chosen) return;
    const payload: Record<string, unknown> = { ...fields };
    if (chosen.matter_id) payload.matter_id = chosen.matter_id;
    try {
      await mutation.mutateAsync({
        actionKey: chosen.key,
        reason: reason.trim() || null,
        payload,
      });
      toast({ title: 'Lifecycle action recorded', description: chosen.label });
      setSelected('');
      setReason('');
      setFields({});
    } catch (error) {
      const err = error as { message?: string; details?: string };
      toast({
        variant: 'destructive',
        title: 'Action rejected',
        description: humanise(err?.details || err?.message || 'Action failed'),
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
          <p className="text-sm text-muted-foreground">No lifecycle actions are available to you for this licence.</p>
        ) : (
          <div className="space-y-3" data-testid="license-current-step-actions">
            <Select
              value={selected}
              onValueChange={(v) => { setSelected(v); setFields({}); }}
            >
              <SelectTrigger className="max-w-md"><SelectValue placeholder="Select a lifecycle action" /></SelectTrigger>
              <SelectContent>
                {actions.map((a) => (
                  <SelectItem key={`${a.key}:${a.matter_id ?? ''}`} value={`${a.key}:${a.matter_id ?? ''}`}>
                    {a.label}
                    {a.matter_kind ? ` · ${a.matter_kind}` : ''}
                    {recommended === a.key ? ' (recommended)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {chosen && (
              <>
                {chosenBlockers.length > 0 && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                    {chosenBlockers.map((b) => (
                      <p key={b.key} className="text-sm flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />{b.label}
                      </p>
                    ))}
                  </div>
                )}

                {/* Server-declared payload schema — no hardcoded per-action form. */}
                {requirements.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2" data-testid="license-step-input-requirements">
                    {requirements.map((r) => (
                      <div key={r.key} className={r.type === 'textarea' ? 'md:col-span-2' : ''}>
                        <Label className="text-xs">
                          {r.label}{r.required ? ' *' : ''}
                        </Label>
                        {r.type === 'textarea' ? (
                          <Textarea
                            rows={3}
                            value={fields[r.key] ?? ''}
                            onChange={(e) => setFields((f) => ({ ...f, [r.key]: e.target.value }))}
                          />
                        ) : r.type === 'select' ? (
                          <Select
                            value={fields[r.key] ?? ''}
                            onValueChange={(v) => setFields((f) => ({ ...f, [r.key]: v }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {(r.options ?? []).map((o) => (
                                <SelectItem key={o} value={o}>{o.replace(/_/g, ' ')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={r.type === 'date' ? 'date' : 'text'}
                            value={fields[r.key] ?? ''}
                            onChange={(e) => setFields((f) => ({ ...f, [r.key]: e.target.value }))}
                          />
                        )}
                        {r.help && <p className="text-xs text-muted-foreground mt-1">{r.help}</p>}
                      </div>
                    ))}
                  </div>
                )}

                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder={requiresReason ? 'Rationale (min 10 characters) — required for this action' : 'Rationale (optional)'}
                />
                <div className="flex items-center gap-3">
                  <Button
                    data-rbac={chosen.permission}
                    onClick={submit}
                    disabled={mutation.isPending || reasonTooShort || chosenBlockers.length > 0 || missingRequired.length > 0}
                  >
                    {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                    {chosen.label}
                  </Button>
                  {reasonTooShort && (
                    <span className="text-xs text-muted-foreground">Rationale must be at least 10 characters.</span>
                  )}
                  {missingRequired.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Required: {missingRequired.map((r) => r.label).join(', ')}
                    </span>
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
