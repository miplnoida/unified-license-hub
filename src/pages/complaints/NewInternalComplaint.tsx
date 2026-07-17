import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useCreateInternalComplaint } from '@/hooks/useMarketConduct';
import { useAuth } from '@/contexts/AuthContext';
import { ComplaintAttachmentsField } from '@/components/complaints/ComplaintAttachmentsField';
import { attachStagedFilesToComplaint } from '@/lib/complaintAttachments';
import { internalComplaintSchema, INTAKE_SOURCES, SEVERITIES } from '@/lib/complaintSchemas';
import { LicenseePicker } from '@/components/complaints/LicenseePicker';
import { toast } from 'sonner';

const sb = supabase as any;

/**
 * Internal regulator-side complaint intake.
 * External intake continues via existing complaint submission flow — this is
 * an additional operational surface for supervisors to record complaints
 * observed internally, referred by other agencies, or reported by whistleblowers.
 */
export default function NewInternalComplaint() {
  const navigate = useNavigate();
  const create = useCreateInternalComplaint();
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const [form, setForm] = useState<any>({
    subject: '', description: '',
    licensee_id: '', complaint_type_id: '', conduct_risk_category_id: '',
    product_id: '', channel_id: '', severity: 'medium', priority: 'p3',
    intake_source: 'internal', email: '', customer_type: '',
    vulnerability_indicator: false, vulnerability_notes: '',
  });

  const updateForm = (patch: Record<string, unknown>) => {
    setForm((prev: any) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const { data: refs } = useQuery({
    queryKey: ['internal-complaint-refs'],
    queryFn: async () => {
      const [{ data: ct }, { data: crc }, { data: p }, { data: c }] = await Promise.all([
        sb.from('complaint_types').select('id, name').eq('is_active', true).order('name'),
        sb.from('conduct_risk_categories').select('id, name').eq('active', true).order('sort_order,name'),
        sb.from('conduct_products').select('id, name').eq('active', true).order('name'),
        sb.from('conduct_channels').select('id, name').eq('active', true).order('name'),
      ]);
      return { types: ct ?? [], categories: crc ?? [], products: p ?? [], channels: c ?? [] };
    },
  });

  const cancel = () => {
    if (dirty && !window.confirm('Discard this complaint? Unsaved changes will be lost.')) return;
    navigate('/complaints');
  };

  const submit = async () => {
    if (create.isPending) return; // duplicate-submit guard
    setErrors({});

    // Structural validation via shared Zod schema. Field-specific messages
    // are shown inline; we still coerce empty-string UUIDs to null for the
    // backend contract.
    const candidate = {
      ...form,
      licensee_id: form.licensee_id || null,
      complaint_type_id: form.complaint_type_id || null,
      conduct_risk_category_id: form.conduct_risk_category_id || null,
      product_id: form.product_id || null,
      channel_id: form.channel_id || null,
      customer_type: form.customer_type || null,
      email: form.email?.trim() ? form.email.trim() : undefined,
      vulnerability_notes: form.vulnerability_notes || undefined,
    };

    const parsed = internalComplaintSchema.safeParse(candidate);
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

    const created = await create.mutateAsync(parsed.data as any);
    if (attachments.length && user?.id && created?.id) {
      const r = await attachStagedFilesToComplaint(attachments, created.id, user.id);
      if (r.failed.length) {
        toast.warning(`Complaint recorded. ${r.failed.length} attachment(s) failed to upload.`);
      } else if (r.uploaded) {
        toast.success(`${r.uploaded} attachment(s) uploaded`);
      }
    }
    setDirty(false);
    navigate(`/complaints/${created.id}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-4xl">
        <PageHeader title="New internal complaint" description="Record a complaint observed internally, referred by another agency, or reported anonymously." />
        <Card>
          <CardContent className="p-6 grid gap-4">
            <div>
              <Label>Subject *</Label>
              <Input value={form.subject} onChange={e => updateForm({ subject: e.target.value })} aria-invalid={!!errors.subject} />
              {errors.subject && <p className="mt-1 text-xs text-red-600">{errors.subject}</p>}
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea rows={5} value={form.description} onChange={e => updateForm({ description: e.target.value })} aria-invalid={!!errors.description} />
              {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Regulated entity</Label>
                <Select value={form.licensee_id} onValueChange={v => updateForm({ licensee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
                  <SelectContent>{(refs?.licensees ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Intake source</Label>
                <Select value={form.intake_source} onValueChange={v => updateForm({ intake_source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INTAKE_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Complaint type</Label>
                <Select value={form.complaint_type_id} onValueChange={v => updateForm({ complaint_type_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{(refs?.types ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
                {errors.complaint_type_id && <p className="mt-1 text-xs text-red-600">{errors.complaint_type_id}</p>}
              </div>
              <div>
                <Label>Conduct category</Label>
                <Select value={form.conduct_risk_category_id} onValueChange={v => updateForm({ conduct_risk_category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{(refs?.categories ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Product</Label>
                <Select value={form.product_id} onValueChange={v => updateForm({ product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{(refs?.products ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Channel</Label>
                <Select value={form.channel_id} onValueChange={v => updateForm({ channel_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                  <SelectContent>{(refs?.channels ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => updateForm({ severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Customer type</Label>
                <Select value={form.customer_type || 'none'} onValueChange={v => updateForm({ customer_type: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="sme">SME</SelectItem>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="vulnerable">Vulnerable</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-center justify-between border rounded-md px-3 py-2">
                <Label>Vulnerable customer</Label>
                <Switch checked={form.vulnerability_indicator} onCheckedChange={v => updateForm({ vulnerability_indicator: v, vulnerability_notes: v ? form.vulnerability_notes : '' })} />
              </div>
              {form.vulnerability_indicator && (
                <div className="col-span-2">
                  <Label>Vulnerability notes</Label>
                  <Textarea rows={2} value={form.vulnerability_notes} onChange={e => updateForm({ vulnerability_notes: e.target.value })} aria-invalid={!!errors.vulnerability_indicator} />
                  {errors.vulnerability_indicator && <p className="mt-1 text-xs text-red-600">{errors.vulnerability_indicator}</p>}
                </div>
              )}
              <div className="col-span-2">
                <Label>Complainant email (optional)</Label>
                <Input value={form.email} onChange={e => updateForm({ email: e.target.value })} placeholder="Leave blank for anonymous / internal" aria-invalid={!!errors.email} />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>
            </div>

            <ComplaintAttachmentsField files={attachments} onChange={(files) => { setAttachments(files); setDirty(true); }} disabled={create.isPending} />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancel} disabled={create.isPending}>Cancel</Button>
              <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Recording…' : 'Record complaint'}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
