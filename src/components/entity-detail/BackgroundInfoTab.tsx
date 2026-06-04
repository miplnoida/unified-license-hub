import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Building2, MapPin, Save, Loader2, CheckCircle2, XCircle, User, FileText, Paperclip } from 'lucide-react';

interface BackgroundInfoTabProps {
  entity: any;
  sectors: Record<string, string>;
  subSectors: Record<string, string>;
  categories: Record<string, string>;
  onUpdate: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const formatAddress = (a: any): string => {
  if (!a || typeof a !== 'object') return '';
  const parts = [a.street, a.city, a.state, a.zip || a.postal_code, a.country].filter(Boolean);
  return parts.join(', ');
};

const humanizeKey = (k: string) =>
  k.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const renderValue = (v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.map(renderValue).join(', ') : '—';
  if (typeof v === 'object') {
    const addr = formatAddress(v);
    if (addr) return addr;
    return JSON.stringify(v);
  }
  return String(v);
};

export default function BackgroundInfoTab({ entity, sectors, subSectors, categories, onUpdate, onDirtyChange }: BackgroundInfoTabProps) {
  const [form, setForm] = useState({
    name: entity.name || '',
    status: entity.status || 'active',
    sector_id: entity.sector_id || '',
    sub_sector_id: entity.sub_sector_id || '',
    category_id: entity.category_id || '',
  });
  const [saving, setSaving] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [registration, setRegistration] = useState<any>(null);
  const [applicant, setApplicant] = useState<any>(null);
  const [appData, setAppData] = useState<any>(null);
  const [regLoading, setRegLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setRegLoading(true);
      try {
        let applicantId: string | null = null;
        let applicationData: any = null;
        if (entity?.license_id) {
          const { data: lic } = await supabase
            .from('licenses')
            .select('application_id')
            .eq('id', entity.license_id)
            .maybeSingle();
          if (lic?.application_id) {
            const { data: app } = await supabase
              .from('applications')
              .select('applicant_id, data')
              .eq('id', lic.application_id)
              .maybeSingle();
            applicantId = app?.applicant_id || null;
            applicationData = app?.data || null;
          }
        }
        if (cancelled) return;
        setAppData(applicationData);

        if (applicantId) {
          const [regRes, profRes, plRes] = await Promise.all([
            supabase.from('registrations').select('*').eq('user_id', applicantId).maybeSingle(),
            supabase.from('profiles').select('id, full_name, email, phone, entity_name, department').eq('id', applicantId).maybeSingle(),
            supabase.from('pre_license_users').select('id, full_name, email, phone, entity_name, gender, department').eq('id', applicantId).maybeSingle(),
          ]);
          if (cancelled) return;
          setRegistration(regRes.data || null);
          setApplicant(profRes.data || plRes.data || null);
        }
      } finally {
        if (!cancelled) setRegLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [entity?.id, entity?.license_id]);

  const handleChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    onDirtyChange(true);
    if (key === 'name') setNameStatus('idle');
  };

  const checkNameUnique = async () => {
    const trimmed = form.name.trim();
    if (!trimmed || trimmed.toLowerCase() === (entity.name || '').toLowerCase()) {
      setNameStatus('idle');
      return;
    }
    setNameStatus('checking');
    const { data, error } = await supabase
      .from('licensees')
      .select('id')
      .ilike('name', trimmed)
      .neq('id', entity.id)
      .limit(1);
    if (error) { setNameStatus('idle'); return; }
    setNameStatus(data && data.length > 0 ? 'taken' : 'available');
  };

  const handleSave = async () => {
    if (nameStatus === 'taken') {
      toast.error('Entity name already exists');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('licensees').update({
      name: form.name,
      status: form.status,
      sector_id: form.sector_id || null,
      sub_sector_id: form.sub_sector_id || null,
      category_id: form.category_id || null,
    }).eq('id', entity.id);

    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      toast.success('Entity information updated');
      onDirtyChange(false);
      onUpdate();
    }
    setSaving(false);
  };

  const sectorList = Object.entries(sectors).sort((a, b) => a[1].localeCompare(b[1]));
  const subSectorList = Object.entries(subSectors).sort((a, b) => a[1].localeCompare(b[1]));
  const categoryList = Object.entries(categories).sort((a, b) => a[1].localeCompare(b[1]));

  // Build a unified "registration details" view from registration / applicant / app data
  const reg = registration || {};
  const ap = applicant || {};
  const ad = appData || {};

  const detailRows: Array<{ label: string; value: string }> = [
    { label: 'Applicant / Entity Name', value: renderValue(reg.applicant_name || ad.applicant_name || ad.entity_name || ap.entity_name || ap.full_name) },
    { label: 'Alternate Name', value: renderValue(reg.applicant_name_alt) },
    { label: 'First Name', value: renderValue(reg.first_name) },
    { label: 'Last Name', value: renderValue(reg.last_name) },
    { label: 'Contact Person', value: renderValue(ap.full_name) },
    { label: 'Email', value: renderValue(reg.email || ap.email) },
    { label: 'Telephone', value: renderValue(reg.telephone || ap.phone) },
    { label: 'Username', value: renderValue(reg.username) },
    { label: 'Department', value: renderValue(ap.department) },
    { label: 'Gender', value: renderValue(ap.gender) },
    { label: 'Registration Reference', value: renderValue(reg.registration_reference) },
    { label: 'Registration Number', value: renderValue(reg.registration_number) },
    { label: 'Email Verified', value: renderValue(reg.email_verified) },
    { label: 'Terms Accepted', value: renderValue(reg.terms_accepted) },
    { label: 'Mailing Address', value: renderValue(reg.mailing_address) },
    { label: 'Physical Address', value: reg.same_as_mailing ? 'Same as mailing' : renderValue(reg.physical_address) },
  ].filter(r => r.value && r.value !== '—');

  const entitySpecific: Array<[string, any]> = reg.entity_specific_data && typeof reg.entity_specific_data === 'object'
    ? Object.entries(reg.entity_specific_data)
    : [];

  const documents: any[] = Array.isArray(reg.documents_metadata) ? reg.documents_metadata : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entity Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" />
              Entity Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Entity Name *</Label>
              <div className="relative">
                <Input
                  id="name"
                  value={form.name}
                  onChange={e => handleChange('name', e.target.value)}
                  onBlur={checkNameUnique}
                  className={nameStatus === 'taken' ? 'border-destructive pr-10' : 'pr-10'}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {nameStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {nameStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {nameStatus === 'taken' && <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              </div>
              {nameStatus === 'taken' && (
                <p className="text-sm text-destructive">An entity with this name already exists</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={v => handleChange('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Sector</Label>
              <Select value={form.sector_id} onValueChange={v => handleChange('sector_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent>
                  {sectorList.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub-Sector</Label>
              <Select value={form.sub_sector_id} onValueChange={v => handleChange('sub_sector_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select sub-sector" /></SelectTrigger>
                <SelectContent>
                  {subSectorList.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={v => handleChange('category_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categoryList.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Registration Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5 text-primary" />
              Registration Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Entity ID</span>
              <span className="font-mono text-sm">{entity.id?.slice(0, 8)}...</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">{new Date(entity.created_at).toLocaleDateString()}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Last Updated</span>
              <span className="text-sm">{new Date(entity.updated_at).toLocaleDateString()}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="outline" className={`capitalize ${entity.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : 'bg-muted text-muted-foreground'}`}>
                {entity.status}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Sector</span>
              <span className="text-sm">{entity.sector_id ? sectors[entity.sector_id] || '—' : '—'}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Sub-Sector</span>
              <span className="text-sm">{entity.sub_sector_id ? subSectors[entity.sub_sector_id] || '—' : '—'}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Category</span>
              <span className="text-sm">{entity.category_id ? categories[entity.category_id] || '—' : '—'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Registration Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-primary" />
            Registration Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {regLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : detailRows.length === 0 && entitySpecific.length === 0 && documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No registration details available for this entity.</p>
          ) : (
            <div className="space-y-6">
              {detailRows.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                  {detailRows.map(row => (
                    <div key={row.label} className="flex flex-col gap-0.5 py-1.5 border-b border-border/50">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</span>
                      <span className="text-sm text-foreground break-words">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {entitySpecific.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Entity-Specific Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    {entitySpecific.map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-0.5 py-1.5 border-b border-border/50">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{humanizeKey(k)}</span>
                        <span className="text-sm text-foreground break-words">{renderValue(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {documents.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-primary" />
                    Uploaded Documents ({documents.length})
                  </h4>
                  <div className="space-y-2">
                    {documents.map((doc, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-md border border-border/50 bg-muted/30">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">
                            {doc.name || doc.file_name || doc.label || doc.document_name || `Document ${idx + 1}`}
                          </span>
                        </div>
                        {doc.type || doc.mime_type ? (
                          <Badge variant="outline" className="text-xs ml-2 shrink-0">{doc.type || doc.mime_type}</Badge>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
