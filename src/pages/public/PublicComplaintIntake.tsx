/**
 * Public market-conduct complaint intake (/complaints/file).
 *
 * Consumers of financial services are not portal users, so this route is
 * intentionally unauthenticated. The respondent list is populated from entities
 * that actually hold an active regulated licence, and the lodged complaint enters
 * the existing triage/workflow pipeline with a tracking reference.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-complaint-intake`;

type EntityRow = { id: string; name: string; sector_name: string | null };
type TypeRow = { id: string; name: string };

export default function PublicComplaintIntake() {
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [entityQuery, setEntityQuery] = useState('');
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', licensee_id: '',
    complaint_type_id: 'none', subject: '', description: '', website: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [ent, typ] = await Promise.all([
        fetch(`${FN_URL}?action=entities`).then((r) => r.json()).catch(() => ({ rows: [] })),
        fetch(`${FN_URL}?action=types`).then((r) => r.json()).catch(() => ({ rows: [] })),
      ]);
      setEntities(ent.rows || []);
      setTypes(typ.rows || []);
    })();
  }, []);

  const filteredEntities = useMemo(() => {
    const q = entityQuery.trim().toLowerCase();
    if (!q) return entities.slice(0, 100);
    return entities.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 100);
  }, [entities, entityQuery]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          complaint_type_id: form.complaint_type_id === 'none' ? '' : form.complaint_type_id,
        }),
      });
      const body = await res.json();
      if (body?.ok && body.reference) {
        setReference(body.reference);
        return;
      }
      if (body?.fields) setFieldErrors(body.fields);
      setError(body?.message || (body?.fields ? 'Please correct the highlighted fields.' : body?.error || 'Could not lodge your complaint. Please try again.'));
    } catch {
      setError('Could not reach the complaints service. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (reference) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12">
          <Card className="p-8 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
            <h1 className="text-2xl font-bold">Complaint lodged</h1>
            <p className="text-sm text-muted-foreground">
              Keep this reference number safe — you will need it, together with your
              email address, to track progress.
            </p>
            <p className="font-mono text-lg font-semibold">{reference}</p>
            <div className="flex justify-center gap-3 pt-2">
              <Button asChild><Link to="/complaints/track">Track this complaint</Link></Button>
              <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-3 w-3" /> Back to home
        </Link>
        <h1 className="text-2xl font-bold mb-1">File a complaint about a regulated entity</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Use this form if you are a consumer of financial services. You do not need an account.
          Complaints are assessed for market-conduct concerns and you will receive a tracking reference.
        </p>

        <Alert className="mb-6">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Please contact the entity first where possible. Do not include full account numbers,
            card numbers or passwords in your description.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={submit} className="space-y-6">
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="full_name">Full name *</Label>
                <Input id="full_name" value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} />
                {fieldErrors.full_name && <p className="text-xs text-destructive mt-1">{fieldErrors.full_name}</p>}
              </div>
              <div>
                <Label htmlFor="email">Email address *</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
                {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
              </div>
              <div>
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Entity complained against</h2>
            <div>
              <Label htmlFor="entity-search">Search entities</Label>
              <Input id="entity-search" placeholder="Start typing an entity name…" value={entityQuery} onChange={(e) => setEntityQuery(e.target.value)} />
            </div>
            <div>
              <Label>Regulated entity *</Label>
              <Select value={form.licensee_id} onValueChange={set('licensee_id')}>
                <SelectTrigger><SelectValue placeholder={entities.length ? 'Select an entity' : 'Loading entities…'} /></SelectTrigger>
                <SelectContent>
                  {filteredEntities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}{e.sector_name ? ` — ${e.sector_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.licensee_id && <p className="text-xs text-destructive mt-1">{fieldErrors.licensee_id}</p>}
            </div>
            {types.length > 0 && (
              <div>
                <Label>Complaint category</Label>
                <Select value={form.complaint_type_id} onValueChange={set('complaint_type_id')}>
                  <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not sure / other</SelectItem>
                    {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your complaint</h2>
            <div>
              <Label htmlFor="subject">Short summary *</Label>
              <Input id="subject" value={form.subject} onChange={(e) => set('subject')(e.target.value)} />
              {fieldErrors.subject && <p className="text-xs text-destructive mt-1">{fieldErrors.subject}</p>}
            </div>
            <div>
              <Label htmlFor="description">What happened? *</Label>
              <Textarea id="description" rows={8} value={form.description} onChange={(e) => set('description')(e.target.value)} />
              {fieldErrors.description && <p className="text-xs text-destructive mt-1">{fieldErrors.description}</p>}
            </div>
            {/* Honeypot — hidden from users, filled by bots. */}
            <input
              type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
              className="hidden" value={form.website} onChange={(e) => set('website')(e.target.value)}
            />
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Lodge complaint'}</Button>
            <Button asChild variant="ghost"><Link to="/complaints/track">Track an existing complaint</Link></Button>
          </div>
        </form>
      </main>
    </div>
  );
}
