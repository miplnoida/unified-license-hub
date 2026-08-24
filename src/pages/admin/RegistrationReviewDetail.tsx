import { COLLAB_REVIEW_ENABLED } from '@/lib/featureFlags';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WorkflowPanel } from '@/components/applications/WorkflowPanel';
import { useWorkflowTotalSla } from '@/hooks/useWorkflowTotalSla';
import { TotalSlaBadge } from '@/components/workflows/TotalSlaBadge';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useRegistrationConfig } from '@/hooks/useRegistrationConfig';
import { useReviewValueResolver } from '@/components/registration/useReviewValueResolver';
import { AttachmentDisplay, isAttachmentValue } from '@/components/registration/AttachmentDisplay';
import { isDisplayOnlyField } from '@/lib/registrationDisplayTypes';
import { useSectors, useSubSectors, useCategories } from '@/hooks/useMasterConfig';
import type { RegField, RegFormSchema } from '@/types/registrationForm';
import { CollaborativeReview } from '@/components/collab-review/CollaborativeReview';
import { formatDateTime } from '@/lib/datetime';

const formatStatusLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

interface RegistrationRow {
  id: string;
  applicant_name: string | null;
  applicant_name_alt: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  telephone: string | null;
  username: string | null;
  status: string;
  registration_reference: string | null;
  registration_number: string | null;
  created_at: string;
  updated_at: string | null;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  mailing_address: Record<string, any> | null;
  physical_address: Record<string, any> | null;
  same_as_mailing: boolean | null;
  entity_specific_data: Record<string, any> | null;
  documents_metadata: any;
  email_verified: boolean | null;
  terms_accepted: boolean | null;
}

interface WorkflowInfo {
  workflow_id: string | null;
  /** Present when the workflow lookup itself failed (never treated as "none"). */
  error?: string;
}


function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 py-2 border-b last:border-b-0 border-border/50">
      <div className="text-xs sm:text-sm font-medium text-muted-foreground">{label}</div>
      <div className="sm:col-span-2 text-sm break-words">{children}</div>
    </div>
  );
}

function EmptyValue() {
  return <span className="text-muted-foreground/60 italic">Not provided</span>;
}

function renderScalar(value: unknown): React.ReactNode {
  if (value == null || value === '') return <EmptyValue />;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : <EmptyValue />;
  if (typeof value === 'object') return <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>;
  return String(value);
}

function AddressBlock({ addr }: { addr: Record<string, any> | null | undefined }) {
  if (!addr || Object.keys(addr).length === 0) {
    return <p className="text-sm text-muted-foreground italic">Not provided</p>;
  }
  const keys = Object.keys(addr);
  return (
    <div>
      {keys.map(k => (
        <Row key={k} label={k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}>
          {renderScalar(addr[k])}
        </Row>
      ))}
    </div>
  );
}

function collectSchemaFields(schema: RegFormSchema | undefined): RegField[] {
  if (!schema) return [];
  const out: RegField[] = [];
  schema.forEach(s => s.rows.forEach(r => r.columns.forEach(c => { if (c.field) out.push(c.field); })));
  return out;
}

export default function RegistrationReviewDetail() {
  const { registrationId } = useParams<{ registrationId: string }>();
  

  const [reg, setReg] = useState<RegistrationRow | null>(null);
  const [wf, setWf] = useState<WorkflowInfo>({ workflow_id: null });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!registrationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('id', registrationId)
      .maybeSingle();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setReg(data as unknown as RegistrationRow);

    // Read the newest instance for this registration. `limit(1)` (not
    // `maybeSingle()`) so multiple historical instances never error, and the
    // error is surfaced explicitly instead of degrading to "no workflow".
    const { data: inst, error: wfError } = await supabase
      .from('workflow_instances')
      .select('workflow_id, created_at')
      .eq('entity_type', 'registration')
      .eq('entity_id', registrationId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (wfError) {
      setWf({ workflow_id: null, error: wfError.message || 'Unable to load workflow' });
    } else {
      setWf({ workflow_id: ((inst || [])[0] as any)?.workflow_id ?? null });
    }
    setLoading(false);

  }, [registrationId]);

  useEffect(() => { load(); }, [load]);

  const { config } = useRegistrationConfig(
    reg?.sector_id ?? undefined,
    reg?.sub_sector_id ?? undefined,
    reg?.category_id ?? undefined,
    !!reg,
  );

  const resolveReviewValue = useReviewValueResolver(
    config?.formSchema,
    (reg?.entity_specific_data as Record<string, unknown> | null) ?? null,
  );
  const { data: sectors = [] } = useSectors();
  const { data: subSectors = [] } = useSubSectors();
  const { data: categories = [] } = useCategories();

  const sectorName = useMemo(() => (sectors as any[]).find(s => s.id === reg?.sector_id)?.name ?? null, [sectors, reg?.sector_id]);
  const subSectorName = useMemo(() => (subSectors as any[]).find(s => s.id === reg?.sub_sector_id)?.name ?? null, [subSectors, reg?.sub_sector_id]);
  const categoryName = useMemo(() => (categories as any[]).find(s => s.id === reg?.category_id)?.name ?? null, [categories, reg?.category_id]);

  const schemaFields = useMemo(() => collectSchemaFields(config?.formSchema), [config?.formSchema]);
  const fieldByName = useMemo(() => {
    const map = new Map<string, RegField>();
    schemaFields.forEach(f => map.set(f.fieldName, f));
    return map;
  }, [schemaFields]);

  const { data: countriesList = [] } = useQuery({
    queryKey: ['countries-review-detail'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('countries' as never)
        .select('id,name');
      if (error) throw error;
      return (data || []) as unknown as { id: string; name: string }[];
    },
  });
  const countriesMap = useMemo(() => {
    const m: Record<string, string> = {};
    (countriesList as any[]).forEach(c => { m[String(c.id)] = c.name; });
    return m;
  }, [countriesList]);

  const documents = useMemo(() => {
    const d = reg?.documents_metadata;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (typeof d === 'object') return Object.entries(d).map(([k, v]) => ({ key: k, value: v }));
    return [];
  }, [reg?.documents_metadata]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !reg) {
    return (
      <DashboardLayout>
        <PageHeader
          title="Registration Not Found"
          description="This registration could not be located."
          backHref="/admin/registration-review"
          backLabel="Back to list"
        />
      </DashboardLayout>
    );
  }

  const entityData: Record<string, any> = reg.entity_specific_data || {};

  const isPasswordKey = (k: string) => k.toLowerCase().includes('password');
  const SKIP_EXACT = new Set(['same_as_mailing']);
  const shouldSkip = (k: string) => SKIP_EXACT.has(k) || isPasswordKey(k);

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const countryLookupKey = (k: string) => {
    const lk = k.toLowerCase();
    return lk.includes('nationality') || lk.includes('country') || lk.includes('citizenship');
  };

  const fallbackResolve = (key: string, val: unknown): unknown => {
    if (typeof val !== 'string' || !UUID_RE.test(val)) return val;
    if (countryLookupKey(key)) return countriesMap[val] ?? val;
    return val;
  };

  const buildAddress = (prefix: 'mailing' | 'physical') => {
    const base: Record<string, any> = { ...(prefix === 'mailing' ? reg.mailing_address : reg.physical_address) || {} };
    const prefixUnderscore = `${prefix}_`;
    Object.entries(entityData).forEach(([k, v]) => {
      if (!k.startsWith(prefixUnderscore)) return;
      if (shouldSkip(k)) return;
      const sub = k.slice(prefixUnderscore.length);
      const field = fieldByName.get(k);
      const resolved = field ? resolveReviewValue(field, v) : fallbackResolve(k, v);
      if (resolved != null && resolved !== '') base[sub] = resolved;
    });
    return base;
  };

  const resolvedMailing = buildAddress('mailing');
  const resolvedPhysical = buildAddress('physical');
  const sameAsMailing = !!reg.same_as_mailing || entityData.same_as_mailing === true || entityData.same_as_mailing === 'true';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Registration · ${reg.registration_reference || reg.id.slice(0, 8)}`}
          description={`${reg.applicant_name || ''}${reg.email ? ' · ' + reg.email : ''}`}
          backHref="/admin/registration-review"
          backLabel="Back to list"
          actions={<Badge variant="outline" className="capitalize">{formatStatusLabel(reg.status)}</Badge>}
        />

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Applicant & Contact</CardTitle></CardHeader>
            <CardContent>
              <Row label="Applicant Name">{renderScalar(reg.applicant_name)}</Row>
              {reg.applicant_name_alt ? <Row label="Alternate Name">{renderScalar(reg.applicant_name_alt)}</Row> : null}
              <Row label="First Name">{renderScalar(reg.first_name)}</Row>
              <Row label="Last Name">{renderScalar(reg.last_name)}</Row>
              <Row label="Email">{renderScalar(reg.email)}</Row>
              <Row label="Telephone">{renderScalar(reg.telephone)}</Row>
              <Row label="Submitted">{formatDateTime(reg.created_at)}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Sector Classification</CardTitle></CardHeader>
            <CardContent>
              <Row label="Sector">{renderScalar(sectorName)}</Row>
              <Row label="Sub-sector">{renderScalar(subSectorName)}</Row>
              <Row label="Category">{renderScalar(categoryName)}</Row>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Mailing Address</CardTitle></CardHeader>
              <CardContent><AddressBlock addr={resolvedMailing} /></CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Physical Address
                  {sameAsMailing ? <Badge variant="secondary" className="text-xs">Same as mailing</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent><AddressBlock addr={resolvedPhysical} /></CardContent>
            </Card>
          </div>

          {Object.keys(entityData).length > 0 && (
            <Card>
              <CardHeader><CardTitle>Application Details</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(entityData).map(([key, rawValue]) => {
                  if (shouldSkip(key)) return null;
                  if (key.startsWith('mailing_') || key.startsWith('physical_')) return null;
                  const field = fieldByName.get(key);
                  if (field && isDisplayOnlyField(field)) return null;
                  const label = field?.label || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  let content: React.ReactNode;
                  if (isAttachmentValue(rawValue)) {
                    content = <AttachmentDisplay value={rawValue} />;
                  } else if (field) {
                    const resolved = resolveReviewValue(field, rawValue);
                    content = renderScalar(resolved);
                  } else {
                    content = renderScalar(fallbackResolve(key, rawValue));
                  }
                  return <Row key={key} label={label}>{content}</Row>;
                })}
              </CardContent>
            </Card>
          )}

          {documents.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Uploaded Documents</CardTitle></CardHeader>
              <CardContent>
                <AttachmentDisplay value={documents.map((d: any) => d.value ?? d)} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Declarations</CardTitle></CardHeader>
            <CardContent>
              <Row label="Terms Accepted">{reg.terms_accepted ? 'Yes' : 'No'}</Row>
              <Row label="Email Verified">{reg.email_verified ? 'Yes' : 'No'}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Approval Workflow</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <RegistrationTotalSla registrationId={reg.id} />
              {wf.workflow_id ? (
                <ErrorBoundary
                  context="RegistrationReviewDetail · WorkflowPanel"
                  fallback={
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                      <p className="font-medium text-destructive">Unable to load workflow details</p>
                    </div>
                  }
                >
                  <WorkflowPanel
                    entityType="registration"
                    entityNoun="registration"
                    applicationId={reg.id}
                    workflowId={wf.workflow_id}
                    workflowEnabled={true}
                    applicationStatus={reg.status}
                    onStatusChange={load}
                  />
                </ErrorBoundary>
              ) : wf.error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                  <p className="font-medium text-destructive">Unable to load workflow</p>
                  <p className="text-xs text-muted-foreground mt-1">{wf.error}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button>
                </div>
              ) : (
                <div className="rounded-md border border-warning/40 bg-warning/5 p-4 text-sm">
                  <p className="font-medium">No Registration workflow attached</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure one under <strong>Approval Workflows → Used For: Registration</strong> and re-trigger workflow start.
                  </p>
                </div>
              )}

            </CardContent>
          </Card>
        </div>

        {COLLAB_REVIEW_ENABLED && registrationId && (
          <CollaborativeReview
            entityType="registration"
            entityId={registrationId}
            fields={[{ key: 'review_notes', label: 'Review notes', value: '' }]}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function RegistrationTotalSla({ registrationId }: { registrationId: string }) {
  const { byEntityId } = useWorkflowTotalSla({ entityType: 'registration', entityIds: [registrationId] });
  const entry = byEntityId.get(registrationId);
  if (!entry || entry.stepCount === 0) return null;
  return <TotalSlaBadge entry={entry} variant="card" />;
}

