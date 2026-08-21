/**
 * P08 — the shared "Current step" controller for governed conduct objects.
 *
 * Availability, blocking reasons and the payload schema for every action come
 * from the server (`*_available_actions`), which the matching `*_step` RPC
 * re-validates. This component renders that declaration and nothing else: it
 * holds no rules about what may happen next.
 */
import { useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import type { ConductAvailableAction, ConductBlocker } from '@/hooks/useConductProcess';

function UserField({
  value, onChange, label, required,
}: { value: string; onChange: (v: string) => void; label: string; required: boolean }) {
  const { data: users = [] } = useInternalUsers();
  return (
    <div className="md:col-span-2">
      <Label className="text-xs">{label}{required ? ' *' : ''}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select an officer" /></SelectTrigger>
        <SelectContent>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || u.id}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export interface GovernedStepPanelProps {
  title?: string;
  stageLabel?: string | null;
  waitingOn?: string | null;
  actions: ConductAvailableAction[];
  blockers?: ConductBlocker[];
  isTerminal?: boolean;
  terminalMessage?: string;
  emptyMessage?: string;
  rbac?: string;
  pending?: boolean;
  facts?: Array<{ label: string; value: string }>;
  onSubmit: (actionCode: string, payload: Record<string, string>) => Promise<unknown>;
}

export function GovernedStepPanel({
  title = 'Current step',
  stageLabel,
  waitingOn,
  actions,
  blockers = [],
  isTerminal = false,
  terminalMessage = 'This case is concluded. No further lifecycle actions apply.',
  emptyMessage = 'No lifecycle actions are available to you at this stage.',
  rbac = 'market_conduct.edit',
  pending = false,
  facts = [],
  onSubmit,
}: GovernedStepPanelProps) {
  const [selected, setSelected] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  const chosen = actions.find((a) => a.action_code === selected) ?? null;
  const inputs = chosen?.inputs ?? [];
  const missing = inputs.filter((i) => {
    const v = (fields[i.name] ?? '').trim();
    if (i.required && !v) return true;
    return Boolean(i.min_length && v.length > 0 && v.length < i.min_length);
  });

  const submit = async () => {
    if (!chosen) return;
    try {
      await onSubmit(chosen.action_code, fields);
      toast.success(`${chosen.label} recorded`);
      setSelected('');
      setFields({});
    } catch (error) {
      toast.error((error as Error).message || 'Action rejected');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          {stageLabel ? <Badge variant="outline" className="text-xs">{stageLabel}</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(waitingOn || facts.length > 0) && (
          <div className="grid gap-3 text-sm md:grid-cols-3">
            {waitingOn ? (
              <div>
                <p className="text-xs text-muted-foreground">Waiting on</p>
                <p className="font-medium">{waitingOn}</p>
              </div>
            ) : null}
            {facts.map((f) => (
              <div key={f.label}>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="font-medium">{f.value}</p>
              </div>
            ))}
          </div>
        )}

        {blockers.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            {blockers.map((b) => (
              <p key={b.code} className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />{b.label}
              </p>
            ))}
          </div>
        )}

        {isTerminal ? (
          <p className="text-sm text-muted-foreground">{terminalMessage}</p>
        ) : actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-3" data-testid="governed-step-actions">
            <Select value={selected} onValueChange={(v) => { setSelected(v); setFields({}); }}>
              <SelectTrigger className="max-w-md"><SelectValue placeholder="Select the next step" /></SelectTrigger>
              <SelectContent>
                {actions.map((a) => (
                  <SelectItem key={a.action_code + a.label} value={a.action_code}>
                    {a.label}{a.enabled ? '' : ' (blocked)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {chosen && (
              <>
                {!chosen.enabled && chosen.blocked_reason && (
                  <p className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" />{chosen.blocked_reason}
                  </p>
                )}

                {inputs.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {inputs.map((i) => (
                      i.type === 'user' ? (
                        <UserField
                          key={i.name}
                          label={i.label}
                          required={i.required}
                          value={fields[i.name] ?? ''}
                          onChange={(v) => setFields((f) => ({ ...f, [i.name]: v }))}
                        />
                      ) : (
                        <div key={i.name} className={i.type === 'textarea' ? 'md:col-span-2' : ''}>
                          <Label className="text-xs">{i.label}{i.required ? ' *' : ''}</Label>
                          {i.type === 'textarea' ? (
                            <Textarea
                              rows={3}
                              value={fields[i.name] ?? ''}
                              onChange={(e) => setFields((f) => ({ ...f, [i.name]: e.target.value }))}
                            />
                          ) : i.type === 'select' ? (
                            <Select
                              value={fields[i.name] ?? ''}
                              onValueChange={(v) => setFields((f) => ({ ...f, [i.name]: v }))}
                            >
                              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                {(i.options ?? []).map((o) => (
                                  <SelectItem key={o} value={o}>{o}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type={i.type === 'date' ? 'date' : 'text'}
                              value={fields[i.name] ?? ''}
                              onChange={(e) => setFields((f) => ({ ...f, [i.name]: e.target.value }))}
                            />
                          )}
                          {i.min_length ? (
                            <p className="mt-1 text-xs text-muted-foreground">Minimum {i.min_length} characters.</p>
                          ) : null}
                        </div>
                      )
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button data-rbac={rbac} onClick={submit} disabled={pending || !chosen.enabled || missing.length > 0}>
                    {pending
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <ArrowRight className="mr-2 h-4 w-4" />}
                    {chosen.label}
                  </Button>
                  {missing.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Required: {missing.map((m) => m.label).join(', ')}
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

export default GovernedStepPanel;
