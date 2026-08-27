/**
 * Per-event notification preference matrix (FRD NOT-PREF-001).
 *
 * Rows are derived from `notification_event_configs` via the
 * `notification_preference_matrix` RPC — never hardcoded. Every locked control
 * carries the server-supplied reason so users understand why it is fixed; the
 * database enforces the same rules independently of this UI.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Lock, RotateCcw, Save, Search, ShieldAlert, MessageSquareOff, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { SEVERITY_META } from '@/components/notifications/notificationMeta';
import {
  isLocked,
  useNotificationPreferences,
  type PreferenceField,
  type PreferenceRow,
} from '@/hooks/useNotificationPreferences';
import type { NotificationDigestFrequency } from '@/types/notifications';

const FREQUENCIES: Array<{ value: NotificationDigestFrequency; label: string }> = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'hourly', label: 'Hourly digest' },
  { value: 'daily', label: 'Daily digest' },
];

function LockedSwitch({
  row,
  field,
  checked,
  onChange,
  label,
}: {
  row: PreferenceRow;
  field: PreferenceField;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const reason = isLocked(row, field);
  const control = (
    <div className="flex items-center gap-1.5">
      <Switch
        aria-label={`${label} — ${row.name}`}
        checked={checked}
        disabled={Boolean(reason)}
        onCheckedChange={onChange}
      />
      {reason ? <Lock className="h-3 w-3 text-muted-foreground" /> : null}
    </div>
  );
  if (!reason) return control;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">{control}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

export function NotificationPreferenceMatrix() {
  const {
    loading, error, refetch, smsAvailable, lastUpdatedAt,
    rows, dirtyKeys, isDirty, update, reset, save,
  } = useNotificationPreferences();
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('all');

  const modules = useMemo(
    () => Array.from(new Set(rows.map((r) => r.module))).sort(),
    [rows],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (module !== 'all' && r.module !== module) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.event_key.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, module]);

  const grouped = useMemo(() => {
    const map = new Map<string, PreferenceRow[]>();
    for (const r of visible) {
      const list = map.get(r.module) ?? [];
      list.push(r);
      map.set(r.module, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  const onSave = async () => {
    try {
      const result = await save.mutateAsync();
      toast.success(`Saved ${result.updated} notification preference${result.updated === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error((e as Error).message || 'Could not save your preferences');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading your notification preferences…
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Could not load preferences</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error.message}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {!smsAvailable && (
        <Alert>
          <MessageSquareOff className="h-4 w-4" />
          <AlertTitle>SMS delivery unavailable</AlertTitle>
          <AlertDescription>
            SMS is not yet configured. An administrator must enable an SMS provider in
            Settings → Email &amp; SMS before SMS notifications can be switched on.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Regulatory guarantees</AlertTitle>
        <AlertDescription>
          Critical alerts are always shown in-app. Critical and high urgency notifications are always
          sent immediately and can never be batched into a digest. Mandatory notifications cannot be
          switched off or muted. Changes apply to notifications sent from now on.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search notifications…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={module} onValueChange={setModule}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="All modules" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {modules.map((m) => (
              <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {grouped.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No notification types match your search.
        </p>
      )}

      {grouped.map(([mod, list]) => (
        <Card key={mod}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base capitalize">{mod.replace(/_/g, ' ')}</CardTitle>
            <CardDescription>{list.length} notification type{list.length === 1 ? '' : 's'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden lg:grid grid-cols-[1fr_5rem_5rem_5rem_11rem_5rem] gap-2 px-3 text-xs font-medium text-muted-foreground">
              <span>Notification</span>
              <span>In-App</span><span>Email</span><span>SMS</span><span>Frequency</span><span>Mute</span>
            </div>
            {list.map((row) => (
              <div
                key={row.event_key}
                className={`grid lg:grid-cols-[1fr_5rem_5rem_5rem_11rem_5rem] gap-3 rounded-lg border p-3 ${
                  dirtyKeys.includes(row.event_key) ? 'border-primary/50 bg-primary/5' : ''
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{row.name}</p>
                    <Badge variant="outline" className={SEVERITY_META[row.severity]?.className}>
                      {SEVERITY_META[row.severity]?.label ?? row.severity}
                    </Badge>
                    {row.system_required && (
                      <Badge variant="secondary">Mandatory — overrides preferences</Badge>
                    )}
                  </div>
                  {row.description && (
                    <p className="text-sm text-muted-foreground">{row.description}</p>
                  )}
                  <p className="text-xs font-mono text-muted-foreground">{row.event_key}</p>
                </div>

                <LockedSwitch
                  row={row} field="in_app_enabled" label="In-app"
                  checked={row.in_app_enabled}
                  onChange={(v) => update(row.event_key, { in_app_enabled: v })}
                />
                <LockedSwitch
                  row={row} field="email_enabled" label="Email"
                  checked={row.email_enabled}
                  onChange={(v) => update(row.event_key, { email_enabled: v })}
                />
                <LockedSwitch
                  row={row} field="sms_enabled" label="SMS"
                  checked={row.sms_enabled}
                  onChange={(v) => update(row.event_key, { sms_enabled: v })}
                />

                {(() => {
                  const reason = isLocked(row, 'digest_frequency');
                  const select = (
                    <Select
                      value={row.digest_frequency}
                      disabled={Boolean(reason)}
                      onValueChange={(v) =>
                        update(row.event_key, { digest_frequency: v as NotificationDigestFrequency })
                      }
                    >
                      <SelectTrigger aria-label={`Frequency — ${row.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                  if (!reason) return select;
                  return (
                    <Tooltip>
                      <TooltipTrigger asChild><span className="cursor-help">{select}</span></TooltipTrigger>
                      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
                    </Tooltip>
                  );
                })()}

                <LockedSwitch
                  row={row} field="muted" label="Mute"
                  checked={row.muted}
                  onChange={(v) => update(row.event_key, { muted: v })}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/95 p-3 backdrop-blur">
        <p className="text-sm text-muted-foreground">
          {isDirty
            ? `${dirtyKeys.length} unsaved change${dirtyKeys.length === 1 ? '' : 's'}`
            : lastUpdatedAt
              ? `Last updated ${format(new Date(lastUpdatedAt), 'd MMM yyyy, h:mm a')}`
              : 'No personal preferences saved yet — defaults apply.'}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset} disabled={!isDirty || save.isPending}>
            <RotateCcw className="mr-2 h-4 w-4" />Reset
          </Button>
          <Button data-rbac="notification_management.dispatch" onClick={onSave} disabled={!isDirty || save.isPending}>
            {save.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
