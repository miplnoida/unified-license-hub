/**
 * Public market-conduct complaint intake (/complaints/file).
 *
 * Consumers of financial services are not portal users, so this route is
 * intentionally unauthenticated. The respondent list is populated from entities
 * that actually hold an active regulated licence, and the lodged complaint enters
 * the existing triage/workflow pipeline with a tracking reference.
 *
 * Structured consumer fields (contact preference, incident date, outcome sought,
 * whether the entity was approached first) are stored on the complaint record,
 * attachments are uploaded through the same edge function, and the configured
 * CAPTCHA must be passed before submission when the regulator has enabled it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CaptchaWidget } from '@/components/shared/CaptchaWidget';
import { useCaptchaRuntime } from '@/hooks/useCaptchaConfig';
import { ArrowLeft, CheckCircle2, Paperclip, ShieldAlert, X } from 'lucide-react';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-complaint-intake`;

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx';

type EntityRow = { id: string; name: string; sector_name: string | null };
type TypeRow = { id: string; name: string };
type StagedFile = { name: string; content_type: string; data: string; size: number };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export default function PublicComplaintIntake() {
  const { data: captcha } = useCaptchaRuntime();
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [entityQuery, setEntityQuery] = useState('');
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [captchaVerificationId, setCaptchaVerificationId] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', preferred_contact_method: 'email',
    licensee_id: '', complaint_type_id: 'none', product_service: '',
    subject: '', description: '', incident_date: '', outcome_sought: '',
    entity_response: '', website: '',
  });
  const [raisedWithEntity, setRaisedWithEntity] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
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

  const captchaRequired = !!captcha?.enabled;
  const captchaBlocked = !!captcha?.misconfigured;

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const next: StagedFile[] = [];
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      if (files.length + next.length >= MAX_FILES) {
        problems.push(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        problems.push(`${file.name} is larger than 5MB.`);
        continue;
      }
      next.push({
        name: file.name,
        content_type: file.type || 'application/octet-stream',
        data: await readAsDataUrl(file),
        size: file.size,
      });
    }
    setFiles((f) => [...f, ...next]);
    setWarnings(problems);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (captchaBlocked) {
      setError('Security verification is temporarily unavailable. Please try again later.');
      return;
    }
    if (captchaRequired && !captchaVerificationId) {
      setError('Please complete the security check before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setWarnings([]);
    setFieldErrors({});
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          complaint_type_id: form.complaint_type_id === 'none' ? '' : form.complaint_type_id,
          raised_with_entity: raisedWithEntity,
          captcha_verification_id: captchaVerificationId,
          attachments: files.map((f) => ({ name: f.name, content_type: f.content_type, data: f.data })),
        }),
      });
      const body = await res.json();
      if (body?.ok && body.reference) {
        setWarnings(body.attachment_warnings || []);
        setReference(body.reference);
        return;
      }
      if (body?.fields) setFieldErrors(body.fields);
      setCaptchaVerificationId(null);
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
              email address, to track progress. No account is required.
            </p>
            <p className="font-mono text-lg font-semibold">{reference}</p>
            {warnings.length > 0 && (
              <Alert variant="destructive" className="text-left">
                <AlertDescription className="text-xs">
                  Your complaint was lodged, but some attachments were not accepted:
                  <ul className="list-disc pl-4 mt-1">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-center gap-3 pt-2">
              <Button asChild><Link to="/track/complaint">Track this complaint</Link></Button>
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
        {warnings.length > 0 && (
          <Alert className="mb-4">
            <AlertDescription className="text-xs">
              <ul className="list-disc pl-4">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </AlertDescription>
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
                <Label htmlFor="phone">Phone {form.preferred_contact_method === 'phone' ? '*' : '(optional)'}</Label>
                <Input id="phone" value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
                {fieldErrors.phone && <p className="text-xs text-destructive mt-1">{fieldErrors.phone}</p>}
              </div>
              <div>
                <Label>Preferred way to contact you</Label>
                <Select value={form.preferred_contact_method} onValueChange={set('preferred_contact_method')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="post">Post</SelectItem>
                  </SelectContent>
                </Select>
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
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div>
                <Label htmlFor="product_service">Product or service concerned</Label>
                <Input
                  id="product_service" placeholder="e.g. savings account, motor insurance"
                  value={form.product_service} onChange={(e) => set('product_service')(e.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your complaint</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="subject">Short summary *</Label>
                <Input id="subject" value={form.subject} onChange={(e) => set('subject')(e.target.value)} />
                {fieldErrors.subject && <p className="text-xs text-destructive mt-1">{fieldErrors.subject}</p>}
              </div>
              <div>
                <Label htmlFor="incident_date">Date of the incident</Label>
                <Input
                  id="incident_date" type="date" max={new Date().toISOString().slice(0, 10)}
                  value={form.incident_date} onChange={(e) => set('incident_date')(e.target.value)}
                />
                {fieldErrors.incident_date && <p className="text-xs text-destructive mt-1">{fieldErrors.incident_date}</p>}
              </div>
            </div>
            <div>
              <Label htmlFor="description">What happened? *</Label>
              <Textarea id="description" rows={8} value={form.description} onChange={(e) => set('description')(e.target.value)} />
              {fieldErrors.description && <p className="text-xs text-destructive mt-1">{fieldErrors.description}</p>}
            </div>
            <div>
              <Label htmlFor="outcome_sought">What outcome are you seeking?</Label>
              <Textarea
                id="outcome_sought" rows={3} value={form.outcome_sought}
                onChange={(e) => set('outcome_sought')(e.target.value)}
                placeholder="e.g. a refund, a correction to my record, an explanation"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={raisedWithEntity} onCheckedChange={(v) => setRaisedWithEntity(!!v)} />
              I have already raised this with the entity
            </label>
            {raisedWithEntity && (
              <div>
                <Label htmlFor="entity_response">What did the entity say?</Label>
                <Textarea id="entity_response" rows={3} value={form.entity_response} onChange={(e) => set('entity_response')(e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="attachments" className="flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5" /> Supporting documents (optional)
              </Label>
              <Input
                id="attachments" type="file" multiple accept={ACCEPTED}
                onChange={(e) => { void addFiles(e.target.files); e.currentTarget.value = ''; }}
              />
              <p className="text-xs text-muted-foreground">
                Up to {MAX_FILES} files, 5MB each. PDF, images, text or Word documents.
              </p>
              {files.length > 0 && (
                <ul className="space-y-1">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                      <span className="truncate">{f.name} · {(f.size / 1024).toFixed(0)} KB</span>
                      <Button
                        type="button" variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => setFiles((list) => list.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Honeypot — hidden from users, filled by bots. */}
            <input
              type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
              className="hidden" value={form.website} onChange={(e) => set('website')(e.target.value)}
            />
          </Card>

          <CaptchaWidget
            action="public_complaint"
            verificationId={captchaVerificationId}
            onVerificationChange={setCaptchaVerificationId}
          />

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting || captchaBlocked}>
              {submitting ? 'Submitting…' : 'Lodge complaint'}
            </Button>
            <Button asChild variant="ghost"><Link to="/track/complaint">Track an existing complaint</Link></Button>
          </div>
        </form>
      </main>
    </div>
  );
}
