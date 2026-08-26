/**
 * Full complaint tracking view.
 *
 * Renders the redacted public record returned by `get_public_complaint_tracking`
 * — details, progress steps, actions taken, investigation summary, history and
 * correspondence. Used by the signed-in tracking page and by the public
 * /track/complaint page. Written for non-technical readers: plain language,
 * friendly dates, no internal jargon.
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
import { CheckCircle2, Circle, Clock, Loader2, Search, FileSearch, History, Mail } from 'lucide-react';

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
    status_label?: string;
    tasks_total?: number;
    tasks_completed?: number;
    findings?: string | null;
    outcome?: string | null;
    closure_reason?: string | null;
  } | null;
  correspondence?: Array<{ at: string; subject: string | null; body: string | null }>;
  timeline?: Array<{ event_at: string; label: string; description: string }>;
};

/** Friendly date: 27 Jul 2026, 3:40 pm */
const fmt = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(',', ',');
};

interface Props {
  /** Reference from the URL. When absent, only the lookup form is shown. */
  reference?: string;
  /** Contact email used for legacy verification — taken from the session when signed in. */
  email?: string;
  /** Tracking access code issued when the complaint was lodged (primary public credential). */
  accessCode?: string;
  /** Hide the email input (signed-in users don't need to retype it). */
  hideEmailField?: boolean;
  /**
   * Unauthenticated mode: look the complaint up through the public intake edge
   * function using the reference plus a tracking access code, or — for older
   * complaints — the email address on file.
   */
  publicMode?: boolean;
  /** Called when the user submits the lookup form. */
  onLookup: (reference: string, email: string, accessCode?: string) => void;
}

const PUBLIC_FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-complaint-intake`;

export function ComplaintTrackingView({
  reference,
  email = '',
  accessCode = '',
  hideEmailField = false,
  publicMode = false,
  onLookup,
}: Props) {
  const [refInput, setRefInput] = useState(reference ?? '');
  const [emailInput, setEmailInput] = useState(email);
  const [codeInput, setCodeInput] = useState(accessCode);
  const [useLegacyEmail, setUseLegacyEmail] = useState(!!email && !accessCode);
  const [showLookup, setShowLookup] = useState(false);

  const q = useQuery({
    queryKey: ['complaint-tracking', publicMode, reference, email, accessCode],
    enabled:
      !!reference &&
      reference.trim().length >= 4 &&
      (!publicMode || !!email.trim() || !!accessCode.trim()),
    queryFn: async () => {
      if (publicMode) {
        const res = await fetch(PUBLIC_FN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'track',
            reference: (reference ?? '').trim(),
            access_code: accessCode.trim() || null,
            email: email.trim() || null,
          }),
        });
        return (await res.json()) as ComplaintTracking;
      }
      const { data, error } = await supabase.rpc('get_public_complaint_tracking_v2' as any, {
        p_reference: (reference ?? '').trim(),
        p_access_code: accessCode.trim() || null,
        p_email: email.trim() || null,
      });
      if (error) throw error;
      return data as ComplaintTracking;
    },
  });



  const t = q.data;
  const loaded = !!t?.found;
  const steps = t?.steps ?? [];
  const actions = t?.actions ?? [];
  const timeline = t?.timeline ?? [];
  const inv = t?.investigation;
  const corr = t?.correspondence ?? [];
  const formOpen = !loaded || showLookup;

  return (
    <div className="space-y-6">
      {/* Lookup — collapses to a single line once a complaint is on screen */}
      {formOpen ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />Find a complaint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setShowLookup(false);
                onLookup(
                  refInput.trim(),
                  useLegacyEmail ? emailInput.trim() : '',
                  useLegacyEmail ? '' : codeInput.trim(),
                );
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="sm:max-w-xs sm:flex-1">
                  <Label htmlFor="ctv-ref" className="text-xs">Complaint reference</Label>
                  <Input
                    id="ctv-ref"
                    value={refInput}
                    onChange={(e) => setRefInput(e.target.value)}
                    required
                    minLength={4}
                    placeholder="e.g. CMP-2026-000123"
                  />
                </div>
                {publicMode && !useLegacyEmail && (
                  <div className="sm:max-w-xs sm:flex-1">
                    <Label htmlFor="ctv-code" className="text-xs">Tracking access code</Label>
                    <Input
                      id="ctv-code"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                      placeholder="Given to you when you submitted"
                      autoComplete="off"
                    />
                  </div>
                )}
                {(!publicMode || useLegacyEmail) && !hideEmailField && (
                  <div className="sm:max-w-xs sm:flex-1">
                    <Label htmlFor="ctv-email" className="text-xs">Contact email</Label>
                    <Input
                      id="ctv-email"
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                )}
                <Button type="submit" size="sm" disabled={refInput.trim().length < 4 || q.isFetching}>
                  {q.isFetching ? 'Looking up…' : 'Track complaint'}
                </Button>
                {loaded && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowLookup(false)}>
                    Cancel
                  </Button>
                )}
              </div>
              {publicMode && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setUseLegacyEmail((v) => !v)}
                >
                  {useLegacyEmail
                    ? 'Have a tracking access code? Use that instead.'
                    : 'Using an older complaint? Track with your email address.'}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Showing complaint</span>
          <span className="font-mono font-medium text-foreground">{t?.reference}</span>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShowLookup(true)}>
            Track a different complaint
          </Button>
        </div>
      )}

      {q.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading complaint…
        </div>
      )}

      {q.isError && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 space-y-2 text-sm">
            <p className="font-medium text-destructive">Unable to load tracking right now.</p>
            <p className="text-muted-foreground">Please try again in a moment.</p>
            <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {t && !t.found && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {/* Uniform message: never disclose whether a reference exists. */}
            We could not verify those tracking details. Please check the complaint reference and the
            tracking access code (or, for an older complaint, the email address you used) and try again.
          </CardContent>
        </Card>
      )}


      {loaded && t && (
        <>
          {/* Where things stand */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-lg font-semibold">{t.reference}</div>
                  <p className="text-sm text-muted-foreground mt-1">{t.subject}</p>
                </div>
                {t.status && (
                  <Badge variant={t.status.terminal ? 'secondary' : 'default'} className="text-sm px-3 py-1">
                    {t.status.label}
                  </Badge>
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

          {/* What you told us */}
          <Card>
            <CardHeader><CardTitle className="text-base">What your complaint is about</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Type of complaint', t.details?.type],
                  ['Firm concerned', t.details?.entity],
                  ['Product or service', t.details?.product],
                  ['How it reached us', t.details?.channel],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
                    <div>{(value as string) || '—'}</div>
                  </div>
                ))}
              </div>
              {t.details?.description && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Your description</div>
                  <p className="whitespace-pre-wrap">{t.details.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Progress — vertical numbered stepper */}
          {steps.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Where your complaint is now</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {steps.map((s, i) => {
                    const state = s.is_complete ? 'done' : s.is_current ? 'current' : 'upcoming';
                    return (
                      <li key={s.key} className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs ${
                            state === 'done'
                              ? 'border-primary bg-primary text-primary-foreground'
                              : state === 'current'
                              ? 'border-primary text-primary'
                              : 'border-muted text-muted-foreground'
                          }`}
                        >
                          {state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                        </span>
                        <div>
                          <div className={state === 'upcoming' ? 'text-muted-foreground' : 'font-medium'}>
                            {s.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {state === 'done'
                              ? 'Completed'
                              : state === 'current'
                              ? 'Happening now'
                              : 'Still to come'}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* Key decisions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />What we have done so far
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {actions.length === 0 ? (
                <p className="text-muted-foreground">
                  No decisions have been recorded yet. They will appear here as your complaint moves along.
                </p>
              ) : (
                <ul className="divide-y">
                  {actions.map((a, i) => (
                    <li key={i} className="flex flex-wrap items-start justify-between gap-2 py-2">
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

          {/* Investigation — always visible */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSearch className="h-4 w-4" />Investigation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={inv?.status_label === 'Completed' ? 'secondary' : inv?.started ? 'default' : 'outline'}>
                  {inv?.status_label || (inv?.started ? 'In progress' : 'Not yet started')}
                </Badge>
                <span className="text-muted-foreground">
                  {inv?.status_label === 'Completed'
                    ? 'Our review of your complaint has finished.'
                    : inv?.started
                    ? 'Our team is reviewing your complaint.'
                    : 'Your complaint is waiting to be picked up for review.'}
                </span>
              </div>
              {!!inv?.tasks_total && (
                <div className="text-muted-foreground">
                  {inv.tasks_completed ?? 0} of {inv.tasks_total} review activities completed.
                </div>
              )}
              {inv?.findings && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">What we found</div>
                  <p className="whitespace-pre-wrap">{inv.findings}</p>
                </div>
              )}
              {inv?.outcome && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Outcome</div>
                  <p className="whitespace-pre-wrap">{inv.outcome}</p>
                </div>
              )}
              {inv?.closure_reason && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Why the file was closed</div>
                  <p className="whitespace-pre-wrap">{inv.closure_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />History
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {timeline.length === 0 ? (
                <p className="text-muted-foreground">
                  Nothing further recorded yet — you'll see every update here as your complaint moves along.
                </p>
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
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" />Messages sent to you
                </CardTitle>
              </CardHeader>
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
