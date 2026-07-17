/**
 * Public complaint tracking page.
 *
 * Reachable at /track/complaint. Requires a complaint reference number and,
 * for non-anonymous complaints, the contact email on file. Uses the
 * `get_public_complaint_tracking` RPC which returns a redacted view — public
 * status labels only, no assignee names, no internal notes.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Tracking = {
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

export default function PublicComplaintTracking() {
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState<Tracking | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTracking(null);
    const { data, error } = await supabase.rpc('get_public_complaint_tracking' as any, {
      p_reference: reference.trim(),
      p_email: email.trim() || null,
    });
    setLoading(false);
    if (error) {
      setTracking({ found: false, error: error.message });
      return;
    }
    setTracking(data as Tracking);
  };

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Track your complaint</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your complaint reference number to see the latest public status.
            You will need the email address you used when submitting the complaint.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form className="grid gap-4" onSubmit={lookup}>
              <div>
                <Label htmlFor="ref">Complaint reference</Label>
                <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} required minLength={4} placeholder="e.g. CMP-000123" />
              </div>
              <div>
                <Label htmlFor="email">Contact email (leave blank for anonymous complaints)</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <Button type="submit" disabled={loading || reference.trim().length < 4}>
                {loading ? 'Looking up…' : 'Track complaint'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {tracking && !tracking.found && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {tracking.error === 'CONTACT_MISMATCH'
                ? 'We could not verify your contact details for that reference.'
                : 'No complaint found for the details provided. Please check the reference and try again.'}
            </CardContent>
          </Card>
        )}

        {tracking?.found && (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{tracking.reference}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{tracking.subject}</p>
                </div>
                {tracking.status && (
                  <Badge variant={tracking.status.terminal ? 'secondary' : 'default'}>
                    {tracking.status.label}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {tracking.status?.description && (
                <p className="text-sm">{tracking.status.description}</p>
              )}
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
                          {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {new Date(t.event_at).toLocaleString()}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
