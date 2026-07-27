/**
 * Full complaint tracking view.
 *
 * Renders the redacted public record returned by `get_public_complaint_tracking`
 * — details, progress steps, actions taken, investigation summary, history and
 * correspondence. Used by the signed-in tracking page and by the public
 * /track/complaint page.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Circle, Clock, Loader2, Search } from 'lucide-react';

export type ComplaintTracking = {
  found: boolean;
  error?: string;
  is_owner?: boolean;
  reference?: string;
  subject?: string;
  submitted_at?: string;
  updated_at?: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  status?: { label: string; description: string; terminal: boolean };
  details?: {
    description?: string | null;
    type?: string | null;
    channel?: string | null;
    product?: string | null;
    entity?: string | null;
    acknowledged_at?: string | null;
    intake_source?: string | null;
  } | null;
  steps?: Array<{ key: string; label: string; order: number; is_current: boolean; is_complete: boolean; is_terminal: boolean }>;
  actions?: Array<{ at: string; action: string; step?: string | null }>;
  investigation?: {
    started?: boolean;
    tasks_total?: number;
    tasks_completed?: number;
    findings?: string | null;
    outcome?: string | null;
    closure_reason?: string | null;
  } | null;
  correspondence?: Array<{ at: string; subject: string | null; body: string | null }>;
  timeline?: Array<{ event_at: string; label: string; description: string }>;
};

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : '—');

interface Props {
  /** Reference from the URL. When absent, only the lookup form is shown. */
  reference?: string;
  /** Contact email used for verification — taken from the session when signed in. */
  email?: string;
  /** Hide the email input (signed-in users don't need to retype it). */
  hideEmailField?: boolean;
  /** Called when the user submits the lookup form. */
  onLookup: (reference: string, email: string) => void;
}

export function ComplaintTrackingView({ reference, email = '', hideEmailField = false, onLookup }: Props) {
  const [refInput, setRefInput] = useState(reference ?? '');
  const [emailInput, setEmailInput] = useState(email);

  const q = useQuery({
    queryKey: ['complaint-tracking', reference, email],
    enabled: !!reference && reference.trim().length >= 4,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_complaint_tracking' as any, {
        p_reference: (reference ?? '').trim(),
        p_email: email.trim() || null,
      });
      if (error) throw error;
      return data as ComplaintTracking;
    },
  });

  const t = q.data;
  const steps = t?.steps ?? [];
  const actions = t?.actions ?? [];
  const timeline = t?.timeline ?? [];
  const inv = t?.investigation;
  const corr = t?.correspondence ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />Find a complaint
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              onLookup(refInput.trim(), emailInput.trim());
            }}
          >
            <div>
              <Label htmlFor="ctv-ref">Complaint reference</Label>
              <Input
                id="ctv-ref"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                required
                minLength={4}
                placeholder="e.g. CMP-2026-000123"
              />
            </div>
            {!hideEmailField && (
              <div>
                <Label htmlFor="ctv-email">Contact email</Label>
                <Input
                  id="ctv-email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            )}
            <Button type="submit" disabled={refInput.trim().length < 4 || q.isFetching}>
              {q.isFetching ? 'Looking up…' : 'Track complaint'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {q.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading complaint…
        </div>
      )}

      {q.isError && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 space-y-2 text-sm">
            <p className="font-medium text-destructive">Unable to load tracking right now.</p>
            <p className="text-muted-foreground">{(q.error as Error)?.message}</p>
            <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {t && !t.found && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {t.error === 'CONTACT_MISMATCH'
              ? 'We could not verify your contact details for that reference. Please enter the email address used when the complaint was submitted.'
              : 'No complaint found for the details provided. Please check the reference and try again.'}
          </CardContent>
        </Card>
      )}

      {t?.found && (
        <>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-lg font-semibold">{t.reference}</div>
                  <p className="text-sm text-muted-foreground mt-1">{t.subject}</p>
                </div>
                {t.status && (
                  <Badge variant={t.status.terminal ? 'secondary' : 'default'}>{t.status.label}</Badge>
                )}
              </div>
              {t.status?.description && <p className="text-sm">{t.status.description}</p>}
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                {[
                  ['Submitted', t.submitted_at],
                  ['Acknowledged', t.details?.acknowledged_at],
                  ['Last update', t.updated_at],
                  ['Resolved', t.resolved_at],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div className="uppercase tracking-wide text-muted-foreground">{label}</div>
                    <div className="text-sm text-foreground">{fmt(value as string)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Complaint details</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Type', t.details?.type],
                  ['Entity complained about', t.details?.entity],
                  ['Product', t.details?.product],
                  ['Channel', t.details?.channel],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
                    <div>{(value as string) || '—'}</div>
                  </div>
                ))}
              </div>
              {t.details?.description && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Description</div>
                  <p className="whitespace-pre-wrap">{t.details.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {steps.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Progress</CardTitle></CardHeader>
              <CardContent>
                <ol className="flex flex-wrap gap-2">
                  {steps.map((s) => (
                    <li
                      key={s.key}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                        s.is_current
                          ? 'border-primary bg-primary/10 font-medium'
                          : s.is_complete
                          ? 'border-muted bg-muted/40 text-muted-foreground'
                          : 'border-muted text-muted-foreground'
                      }`}
                    >
                      {s.is_complete ? <CheckCircle2 className="h-3 w-3" /> : s.is_current ? <Clock className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                      {s.label}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Actions taken</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {actions.length === 0 ? (
                <p className="text-muted-foreground">No actions recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {actions.map((a, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <div className="font-medium">{a.action}</div>
                        {a.step && <div className="text-xs text-muted-foreground">{a.step}</div>}
                      </div>
                      <div className="text-xs text-muted-foreground">{fmt(a.at)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {inv?.started && (
            <Card>
              <CardHeader><CardTitle className="text-base">Investigation</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="text-muted-foreground">
                  {inv.tasks_total
                    ? `${inv.tasks_completed ?? 0} of ${inv.tasks_total} investigation activities completed.`
                    : 'An investigation has been opened for this complaint.'}
                </div>
                {inv.findings && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Findings</div>
                    <p className="whitespace-pre-wrap">{inv.findings}</p>
                  </div>
                )}
                {inv.outcome && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Outcome</div>
                    <p className="whitespace-pre-wrap">{inv.outcome}</p>
                  </div>
                )}
                {inv.closure_reason && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Closure reason</div>
                    <p className="whitespace-pre-wrap">{inv.closure_reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {timeline.length === 0 ? (
                <p className="text-muted-foreground">No history recorded yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l pl-4">
                  {timeline.map((e, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                      <div className="font-medium">{e.label}</div>
                      {e.description && <div className="text-xs text-muted-foreground">{e.description}</div>}
                      <div className="mt-0.5 text-xs text-muted-foreground">{fmt(e.event_at)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {corr.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Correspondence sent to you</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {corr.map((c, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{c.subject || 'Update'}</div>
                      <div className="text-xs text-muted-foreground">{fmt(c.at)}</div>
                    </div>
                    {c.body && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{c.body}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default ComplaintTrackingView;
