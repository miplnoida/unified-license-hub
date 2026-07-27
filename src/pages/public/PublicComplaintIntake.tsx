/**
 * Public / anonymous complaint intake.
 *
 * Reachable at /complaints/submit without authentication. Submits through the
 * canonical `create_complaint('public', payload)` RPC (executable by anon),
 * which enforces the configured intake rules — subject + description required,
 * email required unless the complaint is marked anonymous, and severity /
 * priority stripped so external complainants cannot self-escalate.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { publicComplaintSchema } from '@/lib/complaintSchemas';
import {
  createComplaint,
  ComplaintValidationError,
  type CreateComplaintResult,
} from '@/hooks/useCreateComplaint';

export default function PublicComplaintIntake() {
  const [form, setForm] = useState({
    subject: '',
    description: '',
    complainant_name: '',
    email: '',
    phone: '',
    complainant_impact_description: '',
    anonymous: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateComplaintResult | null>(null);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const update = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrors({});

    const candidate = {
      subject: form.subject,
      description: form.description,
      anonymous: form.anonymous,
      complainant_name: form.anonymous ? undefined : form.complainant_name,
      email: form.anonymous || !form.email.trim() ? undefined : form.email.trim(),
      phone: form.anonymous || !form.phone.trim() ? undefined : form.phone.trim(),
      complainant_impact_description: form.complainant_impact_description || undefined,
      vulnerability_indicator: false,
    };

    const parsed = publicComplaintSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_form';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      toast.error('Please correct the highlighted fields.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createComplaint({
        variant: form.anonymous ? 'anonymous' : 'public',
        payload: {
          subject: parsed.data.subject,
          description: parsed.data.description,
          anonymous: parsed.data.anonymous,
          email: parsed.data.email ?? null,
          phone: parsed.data.phone ?? null,
          complainant_name: parsed.data.complainant_name ?? null,
          complainant_impact_description: parsed.data.complainant_impact_description ?? null,
        },
        idempotencyKey,
      });
      setResult(created);
    } catch (err) {
      if (err instanceof ComplaintValidationError) {
        const fieldErrors: Record<string, string> = {};
        for (const fe of err.fieldErrors) {
          if (!fieldErrors[fe.field]) fieldErrors[fe.field] = fe.message;
        }
        setErrors(fieldErrors);
        toast.error('Please correct the highlighted fields.');
      } else {
        toast.error((err as Error)?.message || 'Could not submit your complaint. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const Err = ({ field }: { field: string }) =>
    errors[field] ? <p className="text-xs text-destructive mt-1">{errors[field]}</p> : null;

  return (
    <div className="min-h-screen bg-muted/30">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Lodge a complaint</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Report the conduct of a regulated entity. You do not need an account. Once submitted you
            will receive a reference number you can use to{' '}
            <Link to="/track/complaint" className="text-primary underline underline-offset-2">
              track your complaint
            </Link>
            .
          </p>
        </header>

        {result ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Complaint received
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Your reference number
                </div>
                <div className="font-mono text-xl font-semibold text-foreground mt-1">
                  {result.complaint_number}
                </div>
              </div>
              <Alert>
                <AlertDescription>
                  Please save this reference number. It is required to check the status of your
                  complaint, and it is the only way to follow up on an anonymous submission.
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/track/complaint">Track this complaint</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/">Return to home</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form className="grid gap-5" onSubmit={submit} noValidate>
                <div>
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    value={form.subject}
                    maxLength={250}
                    onChange={(e) => update({ subject: e.target.value })}
                    placeholder="Brief summary of your complaint"
                  />
                  <Err field="subject" />
                </div>

                <div>
                  <Label htmlFor="description">What happened? *</Label>
                  <Textarea
                    id="description"
                    rows={7}
                    value={form.description}
                    maxLength={5000}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder="Describe the entity involved, dates, amounts and what went wrong."
                  />
                  <Err field="description" />
                </div>

                <div>
                  <Label htmlFor="impact">How has this affected you? (optional)</Label>
                  <Textarea
                    id="impact"
                    rows={3}
                    maxLength={1000}
                    value={form.complainant_impact_description}
                    onChange={(e) => update({ complainant_impact_description: e.target.value })}
                  />
                  <Err field="complainant_impact_description" />
                </div>

                <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
                  <div className="flex gap-3">
                    <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-foreground">Submit anonymously</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        We will not record your contact details. We will not be able to contact you
                        for more information or send you updates — keep your reference number safe.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={form.anonymous}
                    onCheckedChange={(v) => update({ anonymous: v })}
                    aria-label="Submit anonymously"
                  />
                </div>

                {!form.anonymous && (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="name">Your name (optional)</Label>
                      <Input
                        id="name"
                        value={form.complainant_name}
                        maxLength={200}
                        onChange={(e) => update({ complainant_name: e.target.value })}
                      />
                      <Err field="complainant_name" />
                    </div>
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        maxLength={255}
                        onChange={(e) => update({ email: e.target.value })}
                        placeholder="you@example.com"
                      />
                      <Err field="email" />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone (optional)</Label>
                      <Input
                        id="phone"
                        value={form.phone}
                        maxLength={20}
                        onChange={(e) => update({ phone: e.target.value })}
                      />
                      <Err field="phone" />
                    </div>
                  </div>
                )}

                {errors._form && (
                  <Alert variant="destructive">
                    <AlertDescription>{errors._form}</AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit complaint'}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link to="/track/complaint">Track an existing complaint</Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
