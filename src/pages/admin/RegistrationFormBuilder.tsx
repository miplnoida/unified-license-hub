import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Settings2,
  Shield, Mail, Bot, Upload, CheckSquare,
} from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import type { RegFormSchema } from '@/types/registrationForm';
import { RegistrationFormBuilderEditor } from '@/components/registration-builder/RegistrationFormBuilderEditor';
import { FullRegistrationPreview } from '@/components/registration-builder/FullRegistrationPreview';
import { Eye } from 'lucide-react';

interface Declaration {
  label: string;
  required: boolean;
  linkUrl?: string;
  linkLabel?: string;
}

interface DocType {
  label: string;
  required: boolean;
  allowedTypes: string[];
  maxSizeMB: number;
}

interface ConfigRow {
  id: string;
  name: string;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  is_default: boolean;
  is_active: boolean;
  require_otp: boolean;
  require_captcha: boolean;
  require_documents: boolean;
  terms_url: string;
  privacy_url: string;
  data_protection_url: string;
  declarations: Declaration[];
  document_types: DocType[];
  form_schema: RegFormSchema;
}

const emptyConfig: Omit<ConfigRow, 'id'> = {
  name: '',
  sector_id: null,
  sub_sector_id: null,
  category_id: null,
  is_default: false,
  is_active: true,
  require_otp: true,
  require_captcha: true,
  require_documents: true,
  terms_url: '',
  privacy_url: '',
  data_protection_url: '',
  declarations: [
    { label: 'I agree to the Terms & Conditions', required: true },
    { label: 'I agree to the Privacy Policy', required: true },
    { label: 'I agree to the Data Protection Notice', required: true },
  ],
  document_types: [
    { label: 'Certificate of Incorporation', required: true, allowedTypes: ['.pdf', '.jpg', '.png'], maxSizeMB: 5 },
  ],
  form_schema: defaultFormSchema(),
};

function defaultFormSchema(): RegFormSchema {
  const uid = () => crypto.randomUUID();

  const field = (type: string, label: string, fieldName: string, required = false, opts?: Partial<import('@/types/registrationForm').RegField>): import('@/types/registrationForm').RegField => ({
    id: uid(), type: type as any, label, fieldName, required, ...opts,
  });

  const row = (cols: { span: number; field: import('@/types/registrationForm').RegField | null }[]): import('@/types/registrationForm').RegRow => ({
    id: uid(),
    columns: cols.map(c => ({ span: c.span, field: c.field })),
  });

  return [
    {
      id: uid(),
      title: 'Entity Details',
      description: '',
      rows: [
        // Sector Selection
        row([
          { span: 4, field: field('select', 'Sector', 'sector', true, { placeholder: 'Select sector...', dataSource: 'sector' }) },
          { span: 4, field: field('select', 'Sub-Sector', 'sub_sector', true, { placeholder: 'Select sub-sector...', dataSource: 'sub_sector', dependsOn: 'sector' }) },
          { span: 4, field: field('select', 'Category', 'category', true, { placeholder: 'Select category...', dataSource: 'category', dependsOn: 'sub_sector' }) },
        ]),
        // Applicant Info
        row([
          { span: 6, field: field('text', 'Applicant Name', 'applicant_name', true, { placeholder: 'Enter applicant legal name' }) },
          { span: 6, field: field('text', 'Applicant Name (if available)', 'applicant_name_alt', false, { placeholder: 'Alternate or trading name' }) },
        ]),
        // Business Registration
        row([
          { span: 6, field: field('text', 'Business Registration Number', 'registration_number', false, { placeholder: 'Enter registration number' }) },
          { span: 6, field: null },
        ]),
        // Mailing Address
        row([
          { span: 12, field: field('text', 'Number / Street / Suite', 'mailing_street', true, { placeholder: 'Enter street address', helpText: 'Mailing Address' }) },
        ]),
        row([
          { span: 6, field: field('text', 'City / Town', 'mailing_city', true, { placeholder: 'Enter city' }) },
          { span: 6, field: field('text', 'State / Province / Region', 'mailing_state', true, { placeholder: 'Enter state or province' }) },
        ]),
        row([
          { span: 12, field: field('select', 'Country', 'mailing_country', true, { placeholder: 'Select country...' }) },
        ]),
        // Physical Address
        row([
          { span: 12, field: field('checkbox', 'Same as Mailing Address', 'same_as_mailing', false) },
        ]),
        row([
          { span: 12, field: field('text', 'Number / Street / Suite', 'physical_street', true, { placeholder: 'Enter street address', helpText: 'Physical Address' }) },
        ]),
        row([
          { span: 6, field: field('text', 'City / Town', 'physical_city', true, { placeholder: 'Enter city' }) },
          { span: 6, field: field('text', 'State / Province / Region', 'physical_state', true, { placeholder: 'Enter state or province' }) },
        ]),
        row([
          { span: 12, field: field('select', 'Country', 'physical_country', true, { placeholder: 'Select country...' }) },
        ]),
      ],
    },
    {
      id: uid(),
      title: 'Primary User',
      description: 'Details of the primary contact person for this registration.',
      rows: [
        row([
          { span: 6, field: field('text', 'First Name', 'first_name', true, { placeholder: 'Enter first name' }) },
          { span: 6, field: field('text', 'Last Name', 'last_name', true, { placeholder: 'Enter last name' }) },
        ]),
        row([
          { span: 6, field: field('phone', 'Telephone', 'telephone', true, { placeholder: 'Enter phone number' }) },
          { span: 6, field: field('email', 'Email Address', 'email', true, { placeholder: 'Enter email address' }) },
        ]),
        row([
          { span: 6, field: field('text', 'Username', 'username', false, { placeholder: 'Choose a username' }) },
          { span: 6, field: null },
        ]),
        row([
          { span: 6, field: field('text', 'Password', 'password', true, { placeholder: 'Enter password' }) },
          { span: 6, field: field('text', 'Confirm Password', 'confirm_password', true, { placeholder: 'Re-enter password' }) },
        ]),
      ],
    },
    {
      id: uid(),
      title: 'Supporting Documents',
      description: 'Upload the required supporting documents for your application.',
      rows: [
        row([
          { span: 12, field: field('file', 'Certificate of Incorporation', 'doc_incorporation', true, { helpText: 'PDF, JPG or PNG, max 5MB' }) },
        ]),
        row([
          { span: 12, field: field('file', 'Business License', 'doc_business_license', false, { helpText: 'PDF, JPG or PNG, max 5MB' }) },
        ]),
      ],
    },
    {
      id: uid(),
      title: 'Declarations',
      description: 'Review and accept the required declarations to complete your registration.',
      rows: [
        row([
          { span: 12, field: field('checkbox', 'I agree to the Terms & Conditions', 'terms_accepted', true) },
        ]),
        row([
          { span: 12, field: field('checkbox', 'I agree to the Privacy Policy', 'privacy_accepted', true) },
        ]),
        row([
          { span: 12, field: field('checkbox', 'I agree to the Data Protection Notice', 'data_protection_accepted', true) },
        ]),
      ],
    },
  ];
}

export default function RegistrationFormBuilder() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigRow | null>(null);
  const [form, setForm] = useState<Omit<ConfigRow, 'id'>>(emptyConfig);
  const [saving, setSaving] = useState(false);

  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [subSectors, setSubSectors] = useState<{ id: string; name: string; sector_id: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; sub_sector_id: string }[]>([]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [cfgRes, secRes, subRes, catRes] = await Promise.all([
      supabase.from('registration_form_configs').select('*').order('name'),
      supabase.from('sectors').select('id, name').eq('status', 'active'),
      supabase.from('sub_sectors').select('id, name, sector_id').eq('status', 'active'),
      supabase.from('categories').select('id, name, sub_sector_id').eq('status', 'active'),
    ]);

    setConfigs((cfgRes.data || []).map(c => ({
      ...c,
      declarations: (c.declarations as any) || [],
      document_types: (c.document_types as any) || [],
      form_schema: (c.form_schema as any) || [],
    })));
    setSectors(secRes.data || []);
    setSubSectors(subRes.data || []);
    setCategories(catRes.data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyConfig, form_schema: defaultFormSchema() });
    setDialogOpen(true);
  }

  function openEdit(cfg: ConfigRow) {
    setEditing(cfg);
    setForm({ ...cfg });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);

    const payload = {
      name: form.name,
      sector_id: form.sector_id || null,
      sub_sector_id: form.sub_sector_id || null,
      category_id: form.category_id || null,
      is_default: form.is_default,
      is_active: form.is_active,
      require_otp: form.require_otp,
      require_captcha: form.require_captcha,
      require_documents: form.require_documents,
      terms_url: '',
      privacy_url: '',
      data_protection_url: '',
      declarations: form.declarations as unknown as Json,
      document_types: form.document_types as unknown as Json,
      form_schema: form.form_schema as unknown as Json,
    };

    if (editing) {
      const { error } = await supabase
        .from('registration_form_configs')
        .update(payload)
        .eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Configuration updated');
    } else {
      const { error } = await supabase
        .from('registration_form_configs')
        .insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Configuration created');
    }

    setSaving(false);
    setDialogOpen(false);
    loadAll();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this configuration?')) return;
    const { error } = await supabase.from('registration_form_configs').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); loadAll(); }
  }

  async function handleToggle(id: string, field: string, value: boolean) {
    const { error } = await supabase
      .from('registration_form_configs')
      .update({ [field]: value })
      .eq('id', id);
    if (error) toast.error(error.message);
    else loadAll();
  }

  // Declaration helpers
  function addDeclaration() {
    setForm(prev => ({ ...prev, declarations: [...prev.declarations, { label: '', required: true }] }));
  }
  function updateDeclaration(idx: number, field: keyof Declaration, value: any) {
    setForm(prev => {
      const decls = [...prev.declarations];
      decls[idx] = { ...decls[idx], [field]: value };
      return { ...prev, declarations: decls };
    });
  }
  function removeDeclaration(idx: number) {
    setForm(prev => ({ ...prev, declarations: prev.declarations.filter((_, i) => i !== idx) }));
  }

  // Document type helpers
  function addDocType() {
    setForm(prev => ({ ...prev, document_types: [...prev.document_types, { label: '', required: false, allowedTypes: ['.pdf', '.jpg', '.png'], maxSizeMB: 5 }] }));
  }
  function updateDocType(idx: number, field: keyof DocType, value: any) {
    setForm(prev => {
      const docs = [...prev.document_types];
      docs[idx] = { ...docs[idx], [field]: value };
      return { ...prev, document_types: docs };
    });
  }
  function removeDocType(idx: number) {
    setForm(prev => ({ ...prev, document_types: prev.document_types.filter((_, i) => i !== idx) }));
  }

  const filteredSubSectors = form.sector_id
    ? subSectors.filter(s => s.sector_id === form.sector_id) : subSectors;
  const filteredCategories = form.sub_sector_id
    ? categories.filter(c => c.sub_sector_id === form.sub_sector_id) : categories;

  const totalFields = (schema: RegFormSchema) =>
    schema.reduce((a, s) => a + s.rows.reduce((b, r) => b + r.columns.filter(c => c.field).length, 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Registration Form Builder"
          description="Configure dynamic registration flows for different licensee types."
        />

        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Configuration
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : configs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No registration configurations</h3>
              <p className="text-muted-foreground mt-2">Create your first dynamic registration form configuration.</p>
              <Button onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4 mr-2" /> Create Configuration
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map(cfg => {
                  const sectorName = sectors.find(s => s.id === cfg.sector_id)?.name;
                  const fields = totalFields(cfg.form_schema);
                  return (
                    <TableRow key={cfg.id}>
                      <TableCell>
                        <div className="font-medium">{cfg.name}</div>
                        {cfg.is_default && <Badge variant="secondary" className="mt-1">Default</Badge>}
                      </TableCell>
                      <TableCell>
                        {sectorName ? (
                          <span className="text-sm">{sectorName}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">All types</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{cfg.form_schema.length} steps · {fields} fields</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {cfg.require_otp && <Badge variant="outline" className="text-xs"><Mail className="h-3 w-3 mr-1" />OTP</Badge>}
                          {cfg.require_captcha && <Badge variant="outline" className="text-xs"><Bot className="h-3 w-3 mr-1" />CAPTCHA</Badge>}
                          {cfg.require_documents && <Badge variant="outline" className="text-xs"><Upload className="h-3 w-3 mr-1" />Docs</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={cfg.is_active}
                          onCheckedChange={v => handleToggle(cfg.id, 'is_active', v)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(cfg)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(cfg.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-[95vw] w-[1200px] max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Configuration' : 'New Registration Configuration'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Basic Info + Scope */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Configuration Name *</Label>
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Insurance Company Registration" />
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_default} onCheckedChange={v => setForm(p => ({ ...p, is_default: v }))} />
                    <Label>Default config</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
                    <Label>Active</Label>
                  </div>
                </div>
              </div>

              {/* Scope */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Licensee Type Scope</CardTitle>
                  <CardDescription>Leave blank for a generic config, or scope to specific licensee types.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Sector</Label>
                      <Select value={form.sector_id || '_all'} onValueChange={v => setForm(p => ({ ...p, sector_id: v === '_all' ? null : v, sub_sector_id: null, category_id: null }))}>
                        <SelectTrigger><SelectValue placeholder="All sectors" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">All sectors</SelectItem>
                          {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Sub-Sector</Label>
                      <Select value={form.sub_sector_id || '_all'} onValueChange={v => setForm(p => ({ ...p, sub_sector_id: v === '_all' ? null : v, category_id: null }))}>
                        <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">All</SelectItem>
                          {filteredSubSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Category</Label>
                      <Select value={form.category_id || '_all'} onValueChange={v => setForm(p => ({ ...p, category_id: v === '_all' ? null : v }))}>
                        <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">All</SelectItem>
                          {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Form Builder */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings2 className="h-4 w-4" /> Registration Form Builder
                  </CardTitle>
                  <CardDescription>Design your registration steps, rows, columns and fields below.</CardDescription>
                </CardHeader>
                <CardContent>
                  <RegistrationFormBuilderEditor
                    schema={form.form_schema}
                    onChange={schema => setForm(p => ({ ...p, form_schema: schema }))}
                  />
                </CardContent>
              </Card>

              {/* Security */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> Security & Verification</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-2">
                      <Switch checked={form.require_otp} onCheckedChange={v => setForm(p => ({ ...p, require_otp: v }))} />
                      <Label>Email OTP Verification</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={form.require_captcha} onCheckedChange={v => setForm(p => ({ ...p, require_captcha: v }))} />
                      <Label>CAPTCHA Validation</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={form.require_documents} onCheckedChange={v => setForm(p => ({ ...p, require_documents: v }))} />
                      <Label>Document Upload Step</Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Document Types */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Upload className="h-4 w-4" /> Required Document Types</CardTitle>
                  <CardDescription>Define what documents applicants must upload.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {form.document_types.map((doc, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                      <div className="flex-1 space-y-2">
                        <Input value={doc.label} onChange={e => updateDocType(idx, 'label', e.target.value)} placeholder="Document type name..." />
                        <div className="flex gap-4 items-center">
                          <div className="flex items-center gap-2">
                            <Switch checked={doc.required} onCheckedChange={v => updateDocType(idx, 'required', v)} />
                            <Label className="text-xs">Required</Label>
                          </div>
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">Max MB:</Label>
                            <Input type="number" value={doc.maxSizeMB} onChange={e => updateDocType(idx, 'maxSizeMB', Number(e.target.value))} className="w-16 h-8 text-xs" />
                          </div>
                          <div className="flex-1">
                            <Input value={doc.allowedTypes.join(', ')} onChange={e => updateDocType(idx, 'allowedTypes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder=".pdf, .jpg, .png" className="h-8 text-xs" />
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeDocType(idx)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addDocType}>
                    <Plus className="h-4 w-4 mr-1" /> Add Document Type
                  </Button>
                </CardContent>
              </Card>

              {/* Declarations */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><CheckSquare className="h-4 w-4" /> Declaration Checkboxes</CardTitle>
                  <CardDescription>Configure what the applicant must agree to before submitting.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {form.declarations.map((decl, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                      <div className="flex-1 space-y-2">
                        <Input value={decl.label} onChange={e => updateDeclaration(idx, 'label', e.target.value)} placeholder='Full label, e.g. "I agree to the Terms & Conditions"' />
                        <div className="grid grid-cols-2 gap-2">
                          <Input value={decl.linkLabel || ''} onChange={e => updateDeclaration(idx, 'linkLabel', e.target.value)} placeholder='Clickable text, e.g. "Terms & Conditions"' className="h-8 text-xs" />
                          <Input value={decl.linkUrl || ''} onChange={e => updateDeclaration(idx, 'linkUrl', e.target.value)} placeholder="Link URL (opens in new tab)" className="h-8 text-xs" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={decl.required} onCheckedChange={v => updateDeclaration(idx, 'required', v)} />
                          <Label className="text-xs">Required</Label>
                          {decl.linkLabel && decl.linkUrl && (
                            <span className="text-xs text-muted-foreground ml-2">
                              Preview: "{decl.label?.replace(decl.linkLabel, `[${decl.linkLabel}]`)}"
                            </span>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeDeclaration(idx)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addDeclaration}>
                    <Plus className="h-4 w-4 mr-1" /> Add Declaration
                  </Button>
                </CardContent>
              </Card>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
