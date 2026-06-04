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
import { AttachmentDisplay, isAttachmentValue, normalizeAttachments } from '@/components/registration/AttachmentDisplay';

interface BackgroundInfoTabProps {
  entity: any;
  sectors: Record<string, string>;
  subSectors: Record<string, string>;
  categories: Record<string, string>;
  onUpdate: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const normalizeKey = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();

const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase();

const humanizeKey = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());

const isEmptyValue = (value: any): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptyValue);
  if (typeof value === 'object') {
    const objectValues = Object.values(value);
    return objectValues.length === 0 || objectValues.every(isEmptyValue);
  }
  return false;
};

const pickFirstValue = (...values: any[]) => {
  for (const value of values) {
    if (!isEmptyValue(value)) return value;
  }
  return null;
};

const getRecordValue = (record: Record<string, unknown> | null | undefined, keys: string[]) => {
  if (!record) return null;
  const normalizedEntries = new Map(
    Object.entries(record).map(([key, value]) => [normalizeKey(key), value])
  );

  for (const key of keys) {
    const value = normalizedEntries.get(normalizeKey(key));
    if (!isEmptyValue(value)) return value;
  }

  return null;
};

const buildAddressFromDynamicFields = (record: Record<string, unknown> | null | undefined, prefix: 'mailing' | 'physical') => {
  if (!record) return null;

  const directAddress = getRecordValue(record, [
    `${prefix}_address`,
    `${prefix}Address`,
    `${prefix}_location`,
  ]);

  if (!isEmptyValue(directAddress)) return directAddress;

  const address = {
    street: getRecordValue(record, [`${prefix}_street`, `${prefix}_address_line_1`, `${prefix}_line_1`, `${prefix}_line1`, `${prefix}_address1`]),
    address_line_2: getRecordValue(record, [`${prefix}_address_line_2`, `${prefix}_line_2`, `${prefix}_line2`, `${prefix}_address2`]),
    city: getRecordValue(record, [`${prefix}_city`, `${prefix}_town`, `${prefix}_district`]),
    state: getRecordValue(record, [`${prefix}_state`, `${prefix}_province`, `${prefix}_county`]),
    postal_code: getRecordValue(record, [`${prefix}_postal_code`, `${prefix}_postcode`, `${prefix}_zip`, `${prefix}_zip_code`]),
    country: getRecordValue(record, [`${prefix}_country`]),
  };

  return Object.values(address).some((value) => !isEmptyValue(value)) ? address : null;
};

const ADDRESS_KEY_ORDER = [
  'street',
  'address_line_1',
  'address_line1',
  'line1',
  'address1',
  'address',
  'street_address',
  'address_line_2',
  'address_line2',
  'line2',
  'address2',
  'city',
  'town',
  'district',
  'state',
  'parish',
  'province',
  'county',
  'postal_code',
  'postcode',
  'zip',
  'zip_code',
  'country',
];

const FIXED_DYNAMIC_KEYS = new Set([
  'registration_reference',
  'registration_number',
  'email',
  'username',
  'first_name',
  'last_name',
  'applicant_name',
  'applicant_name_alt',
  'telephone',
  'mailing_address',
  'physical_address',
  'same_as_mailing',
  'email_verified',
  'terms_accepted',
  'status',
  'created_at',
  'updated_at',
  'sector',
  'sub_sector',
  'category',
  'sector_id',
  'sub_sector_id',
  'category_id',
  'documents_metadata',
]);

const SENSITIVE_DYNAMIC_KEYS = new Set([
  'password',
  'confirm_password',
  'password_confirmation',
  'confirm_password_value',
  'otp',
  'pin',
  'secret',
]);

const formatDateTime = (value: unknown): string => {
  if (!value) return 'Not provided';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const formatAddress = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map(formatAddress).filter(Boolean).join(', ');
  }
  if (typeof value !== 'object') return String(value);

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '';

  const normalizedEntries = new Map(entries.map(([key, entryValue]) => [normalizeKey(key), entryValue]));
  const usedKeys = new Set<string>();
  const orderedParts = ADDRESS_KEY_ORDER
    .map((key) => {
      const entryValue = normalizedEntries.get(key);
      if (isEmptyValue(entryValue)) return null;
      usedKeys.add(key);
      return typeof entryValue === 'string' ? entryValue.trim() : String(entryValue);
    })
    .filter(Boolean) as string[];

  const extraParts = entries
    .filter(([key, entryValue]) => !usedKeys.has(normalizeKey(key)) && !isEmptyValue(entryValue))
    .map(([key, entryValue]) => `${humanizeKey(key)}: ${renderValue(entryValue)}`);

  return [...orderedParts, ...extraParts].join(', ');
};

const renderValue = (value: any): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(renderValue).join(', ') : '—';
  if (typeof value === 'object') {
    const address = formatAddress(value);
    if (address) return address;
    const objectEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => !isEmptyValue(entryValue))
      .map(([key, entryValue]) => `${humanizeKey(key)}: ${renderValue(entryValue)}`);
    return objectEntries.length ? objectEntries.join(', ') : '—';
  }
  return String(value);
};

const scoreApplicationMatch = (applicationData: any, entity: any) => {
  if (!applicationData || typeof applicationData !== 'object') return 0;

  const entityName = normalizeText(entity?.name);
  const candidateNames = [applicationData?.entity_name, applicationData?.applicant_name].map(normalizeText);

  let score = 0;
  if (entityName && candidateNames.some(name => name && name === entityName)) score += 8;
  if (entity?.sector_id && applicationData?.sector_id === entity.sector_id) score += 2;
  if (entity?.sub_sector_id && applicationData?.sub_sector_id === entity.sub_sector_id) score += 3;
  if (entity?.category_id && applicationData?.category_id === entity.category_id) score += 4;

  return score;
};

const resolveMappedValue = (id: string | null | undefined, options: Record<string, string>) => {
  if (!id) return 'Not provided';
  return options[id] || id;
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
      setRegistration(null);
      setApplicant(null);
      setAppData(null);

      try {
        const { data, error } = await supabase.functions.invoke('get-licensee-registration', {
          body: {
            entity_id: entity?.id || null,
            license_id: entity?.license_id || null,
            name: entity?.name || '',
            sector_id: entity?.sector_id || null,
            sub_sector_id: entity?.sub_sector_id || null,
            category_id: entity?.category_id || null,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (cancelled) return;
        setApplicant(data?.applicant || null);
        setAppData(data?.application?.data && typeof data.application.data === 'object' ? data.application.data : null);
        setRegistration(data?.registration || null);
      } catch (error: any) {
        console.error('[BackgroundInfoTab] Failed to load registration details:', error);
      } finally {
        if (!cancelled) setRegLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [entity?.id, entity?.license_id, entity?.name, entity?.sector_id, entity?.sub_sector_id, entity?.category_id]);

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
    if (error) {
      setNameStatus('idle');
      return;
    }
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

  const reg = registration || null;
  const ap = applicant || {};
  const ad = appData || {};
  const entitySpecificData = reg?.entity_specific_data && typeof reg.entity_specific_data === 'object'
    ? reg.entity_specific_data as Record<string, unknown>
    : null;
  const hasRegistration = Boolean(reg?.id);

  const showVal = (value: any) => {
    const rendered = renderValue(value);
    return rendered && rendered !== '—' ? rendered : 'Not provided';
  };

  const resolvedSectorId = reg?.sector_id || ad?.sector_id || entity?.sector_id;
  const resolvedSubSectorId = reg?.sub_sector_id || ad?.sub_sector_id || entity?.sub_sector_id;
  const resolvedCategoryId = reg?.category_id || ad?.category_id || entity?.category_id;
  const mailingAddressValue = pickFirstValue(
    reg?.mailing_address,
    buildAddressFromDynamicFields(entitySpecificData, 'mailing')
  );
  const physicalAddressValue = pickFirstValue(
    reg?.physical_address,
    buildAddressFromDynamicFields(entitySpecificData, 'physical'),
    reg?.same_as_mailing ? mailingAddressValue : null
  );

  const detailRows: Array<{ label: string; value: string }> = hasRegistration
    ? [
        { label: 'Registration Reference', value: showVal(reg.registration_reference) },
        { label: 'Registration Number', value: showVal(pickFirstValue(reg.registration_number, getRecordValue(entitySpecificData, ['registration_number']))) },
        { label: 'Email', value: showVal(pickFirstValue(reg.email, getRecordValue(entitySpecificData, ['email']), ap.email, ad.email)) },
        { label: 'Username', value: showVal(pickFirstValue(reg.username, getRecordValue(entitySpecificData, ['username']))) },
        { label: 'First Name', value: showVal(pickFirstValue(reg.first_name, getRecordValue(entitySpecificData, ['first_name']))) },
        { label: 'Last Name', value: showVal(pickFirstValue(reg.last_name, getRecordValue(entitySpecificData, ['last_name']))) },
        { label: 'Applicant / Entity Name', value: showVal(pickFirstValue(reg.applicant_name, getRecordValue(entitySpecificData, ['applicant_name']), ad.applicant_name, ad.entity_name, ap.entity_name)) },
        { label: 'Alternate Name', value: showVal(pickFirstValue(reg.applicant_name_alt, getRecordValue(entitySpecificData, ['applicant_name_alt']))) },
        { label: 'Telephone', value: showVal(pickFirstValue(reg.telephone, getRecordValue(entitySpecificData, ['telephone', 'phone']), ap.phone)) },
        { label: 'Mailing Address', value: showVal(mailingAddressValue) },
        {
          label: 'Physical Address',
          value: showVal(physicalAddressValue),
        },
        {
          label: 'Same As Mailing',
          value: reg.same_as_mailing === undefined || reg.same_as_mailing === null ? 'Not provided' : (reg.same_as_mailing ? 'Yes' : 'No'),
        },
        {
          label: 'Email Verified',
          value: reg.email_verified === undefined || reg.email_verified === null ? 'Not provided' : (reg.email_verified ? 'Yes' : 'No'),
        },
        {
          label: 'Terms Accepted',
          value: reg.terms_accepted === undefined || reg.terms_accepted === null ? 'Not provided' : (reg.terms_accepted ? 'Yes' : 'No'),
        },
        { label: 'Status', value: showVal(reg.status) },
        { label: 'Created At', value: formatDateTime(reg.created_at) },
        { label: 'Updated At', value: formatDateTime(reg.updated_at) },
        { label: 'Sector', value: resolveMappedValue(resolvedSectorId, sectors) },
        { label: 'Sub-Sector', value: resolveMappedValue(resolvedSubSectorId, subSectors) },
        { label: 'Category', value: resolveMappedValue(resolvedCategoryId, categories) },
      ]
    : [];

  const entitySpecific: Array<[string, any]> = hasRegistration && reg?.entity_specific_data && typeof reg.entity_specific_data === 'object'
    ? Object.entries(reg.entity_specific_data as Record<string, unknown>).filter(([key, value]) => {
        const normalized = normalizeKey(key);
        if (FIXED_DYNAMIC_KEYS.has(normalized)) return false;
        if (SENSITIVE_DYNAMIC_KEYS.has(normalized) || normalized.includes('password')) return false;
        return !isEmptyValue(value);
      })
    : [];

  const documents: any[] = hasRegistration && Array.isArray(reg?.documents_metadata)
    ? reg.documents_metadata
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  {nameStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-primary" />}
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
          ) : !hasRegistration ? (
            <p className="text-sm text-muted-foreground py-4">No linked registration record found for this entity.</p>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                {detailRows.map(row => (
                  <div key={row.label} className="flex flex-col gap-0.5 py-1.5 border-b border-border/50">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</span>
                    <span className="text-sm text-foreground break-words">{row.value}</span>
                  </div>
                ))}
              </div>

              {entitySpecific.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Entity-Specific Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    {entitySpecific.map(([key, value]) => (
                      <div key={key} className="flex flex-col gap-0.5 py-1.5 border-b border-border/50">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{humanizeKey(key)}</span>
                        <span className="text-sm text-foreground break-words">{renderValue(value)}</span>
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
                  <div className="space-y-3">
                    {documents.map((document, index) => {
                      const documentEntries = document && typeof document === 'object'
                        ? Object.entries(document as Record<string, unknown>).filter(([key, value]) => {
                            const normalized = normalizeKey(key);
                            return !['name', 'file_name', 'label', 'document_name', 'type', 'mime_type'].includes(normalized) && !isEmptyValue(value);
                          })
                        : [];

                      return (
                        <div key={index} className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium break-words">
                                {typeof document === 'object' && document
                                  ? (document.name || document.file_name || document.label || document.document_name || `Document ${index + 1}`)
                                  : `Document ${index + 1}`}
                              </span>
                            </div>
                            {typeof document === 'object' && document && (document.type || document.mime_type) ? (
                              <Badge variant="outline" className="text-xs shrink-0">{document.type || document.mime_type}</Badge>
                            ) : null}
                          </div>

                          {documentEntries.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                              {documentEntries.map(([key, value]) => (
                                <div key={key} className="flex flex-col gap-0.5 py-1.5 border-b border-border/50">
                                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{humanizeKey(key)}</span>
                                  <span className="text-sm text-foreground break-words">{renderValue(value)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
