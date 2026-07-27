/**
 * Reusable complaint tracking panel.
 *
 * Renders the reference lookup form plus the redacted public status/timeline
 * returned by the `get_public_complaint_tracking` RPC. Used both by the public
 * /track/complaint page and by the signed-in applicant complaints portal.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type ComplaintTracking = {
  found: boolean;
  error?: string;
  reference?: string;
  subject?: string;
  submitted_at?: string;
  updated_at?: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  status?: { label: string; description: string; terminal: boolean };
  timeline?: Array<{ event_at: string; label: string; description: string }>;
};

interface Props {
  /** Pre-fill the reference number (e.g. from a row action). */
  initialReference?: string;
  /** Contact email used for verification — taken from the session when signed in. */
  initialEmail?: string;
  /** Hide the email input (signed-in users don't need to retype it). */
  hideEmailField?: boolean;
  /** Run the lookup immediately when a reference is provided. */
  autoLookup?: boolean;
}

export function ComplaintTrackingPanel({
  initialReference = '',
  initialEmail = '',
  hideEmailField = false,
  autoLookup = false,
}: Props) {
  const [reference, setReference] = useState(initialReference);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState<ComplaintTracking | null>(null);

  const runLookup = useCallback(async (ref: string, mail: string) => {
    if (ref.trim().length < 4) return;
    setLoading(true);
    setTracking(null);
    const { data, error } = await supabase.rpc('get_public_complaint_tracking' as any, {
      p_reference: ref.trim(),
      p_email: mail.trim() || null,
    });
    setLoading(false);
    if (error) {
      setTracking({ found: false, error: error.message });
      return;
    }
    setTracking(data as ComplaintTracking);
  }, []);

  useEffect(() => {
    if (autoLookup && initialReference) {
      void runLookup(initialReference, initialEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLookup, initialReference, initialEmail]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runLookup(reference, email);
  };

  return (
    <div className="space-y-6">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="ctp-ref">Complaint reference</Label>
          <Input
            id="ctp-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            required
            minLength={4}
            placeholder="e.g. CMP-000123"
          />
        </div>
        {!hideEmailField && (
          <div>
            <Label htmlFor="ctp-email">Contact email (leave blank for anonymous complaints)</Label>
            <Input
              id="ctp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        )}
        <Button type="submit" disabled={loading || reference.trim().length < 4}>
          {loading ? 'Looking up…' : 'Track complaint'}
        </Button>
      </form>

      {tracking && !tracking.found && (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          {tracking.error === 'CONTACT_MISMATCH'
            ? 'We could not verify your contact details for that reference.'
            : 'No complaint found for the details provided. Please check the reference and try again.'}
        </div>
      )}

      {tracking?.found && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-base font-semibold text-foreground">{tracking.reference}</div>
              <p className="text-sm text-muted-foreground mt-1">{tracking.subject}</p>
            </div>
            {tracking.status && (
              <Badge variant={tracking.status.terminal ? 'secondary' : 'default'}>
                {tracking.status.label}
              </Badge>
            )}
          </div>

          {tracking.status?.description && <p className="text-sm">{tracking.status.description}</p>}

          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <div className="uppercase tracking-wide">Submitted</div>
              <div className="text-foreground text-sm">
                {tracking.submitted_at ? new Date(tracking.submitted_at).toLocaleString() : '—'}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-wide">Last update</div>
              <div className="text-foreground text-sm">
                {tracking.updated_at ? new Date(tracking.updated_at).toLocaleString() : '—'}
              </div>
            </div>
          </div>

          {tracking.timeline && tracking.timeline.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Progress</h3>
              <ol className="space-y-3">
                {tracking.timeline.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{t.label}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(t.event_at).toLocaleString()}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
