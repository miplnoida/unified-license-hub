import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useLicenseExpiryConfig } from '@/hooks/useLicenseExpiryConfig';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { usePpoc } from '@/contexts/PpocContext';
import { useLicenseeAccessGuard } from '@/hooks/useLicenseeAccessGuard';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useRegulator } from '@/contexts/RegulatorContext';
import { logAudit } from '@/hooks/useAuditLog';
import { dispatchNotificationEvent } from '@/lib/notificationEvents';
import { toast } from 'sonner';
import { LicenseStatus, INTERNAL_ROLES } from '@/types/platform';
import { Loader2, PauseCircle, XCircle, RotateCcw, RefreshCw, AlertTriangle, Ban, FileDown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatTaxonomyLabel } from '@/lib/formatTaxonomyLabel';
import { LicenseStatusBadge } from '@/lib/licenseStatusBadge';

interface License {
  id: string;
  license_number: string;
  license_type: string;
  holder_id: string;
  status: LicenseStatus;
  issued_at: string;
  valid_from: string;
  valid_until: string | null;
  conditions: string | null;
  compliance_requirements: any;
  application_id: string | null;
  created_at: string;
  updated_at: string;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
}

interface RenewalFeeInfo {
  amount: number;
  currency: string;
}

interface LicenseAction {
  id: string;
  action_type: string;
  actor_id: string;
  reason: string | null;
  old_status: string;
  new_status: string;
  created_at: string;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default', suspended: 'outline', revoked: 'destructive', expired: 'secondary', cancelled: 'destructive',
};

const MANDATORY_REASON_ACTIONS = new Set(['suspension', 'revocation', 'cancellation']);
const MIN_REASON_LEN = 10;

function addYears(iso: string | null, years: number): string {
  const base = iso ? new Date(iso) : new Date();
  base.setFullYear(base.getFullYear() + years);
  return base.toISOString().slice(0, 10);
}

export default function LicenseDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const portalContext = useEffectivePortalContext();
  const { resolvedLicenseeId } = usePpoc();
  const accessGuard = useLicenseeAccessGuard();
  const { activeRegulator } = useRegulator();
  const { data: expiryConfig } = useLicenseExpiryConfig();
  const { data: formTemplates = [], isLoading: templatesLoading } = useFormTemplates(undefined, activeRegulator?.id);
  const [license, setLicense] = useState<License | null>(null);
  const [linkedLicenseeId, setLinkedLicenseeId] = useState<string | null>(null);
  const [actions, setActions] = useState<LicenseAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [startingRenewal, setStartingRenewal] = useState(false);
  const [renewalFee, setRenewalFee] = useState<RenewalFeeInfo | null>(null);
  const [pendingRenewalAppId, setPendingRenewalAppId] = useState<string | null>(null);
  const [inProgressRenewalAppId, setInProgressRenewalAppId] = useState<string | null>(null);
  const isInternal = !!user && !portalContext.loading && (portalContext.isInternal || INTERNAL_ROLES.includes(user.role));

  // Submitted (post-submit) renewal — duplicates blocked, opens read-only.
  const PENDING_RENEWAL_STATUSES = ['submitted', 'under_review', 'query_raised', 'resubmission_requested'];
  // Pre-submission renewal — clicking Renew should reopen the same form
  // instead of inserting a new draft.
  const IN_PROGRESS_RENEWAL_STATUSES = ['draft', 'in_progress'];

  const refreshPendingRenewal = async (licenseId: string) => {
    const [pendingRes, draftRes] = await Promise.all([
      supabase
        .from('applications' as any)
        .select('id, status, data, created_at')
        .eq('data->>renewal_of_license_id', licenseId)
        .in('status', PENDING_RENEWAL_STATUSES as any)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('applications' as any)
        .select('id, status, data, created_at')
        .eq('data->>renewal_of_license_id', licenseId)
        .eq('data->>is_renewal', 'true')
        .in('status', IN_PROGRESS_RENEWAL_STATUSES as any)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    const pendingRow = ((pendingRes.data as any[]) || [])[0];
    const draftRow = ((draftRes.data as any[]) || [])[0];
    setPendingRenewalAppId(pendingRow?.id || null);
    setInProgressRenewalAppId(draftRow?.id || null);
  };

  useEffect(() => {
    async function load() {
      if (!id) return;
      const { data } = await supabase.from('licenses' as any).select('*').eq('id', id).single();
      if (data) setLicense(data as any);
      const { data: acts } = await supabase.from('license_actions' as any).select('*').eq('license_id', id).order('created_at', { ascending: false });
      if (acts) setActions(acts as any);
      const { data: linked } = await supabase
        .from('licensees' as any)
        .select('id')
        .eq('license_id', id)
        .maybeSingle();
      if (linked) setLinkedLicenseeId((linked as any).id);
      await refreshPendingRenewal(id);
      setLoading(false);
    }
    load();
  }, [id]);


  // Resolve renewal fee from Fee Management: a fee with fee_type "renewal"
  // scoped to this license's sector/sub-sector/category. Mirrors the resolver
  // in src/lib/applicationFeeBreakdown.ts so the badge matches what the
  // renewal application's payment panel will compute. Independent of whether
  // a "Renew" service row exists for the sub-sector.
  useEffect(() => {
    async function loadRenewalFee() {
      if (!license?.sector_id) { setRenewalFee(null); return; }
      const { data: fees } = await supabase
        .from('fee_configurations' as any)
        .select('amount, currency, sector_id, sub_sector_id, category_id, service_id')
        .eq('is_active', true)
        .ilike('fee_type', '%renew%')
        .or(`sector_id.eq.${license.sector_id},sector_id.is.null`);
      const rows = (fees as any[] | null) || [];
      const match = rows
        .filter((r) => !r.sub_sector_id || !license.sub_sector_id || r.sub_sector_id === license.sub_sector_id)
        .filter((r) => !r.category_id || !license.category_id || r.category_id === license.category_id)
        .map((r) => ({
          row: r,
          score:
            (r.category_id === license.category_id ? 4 : 0) +
            (r.sub_sector_id === license.sub_sector_id ? 2 : 0) +
            (r.sector_id === license.sector_id ? 1 : 0),
        }))
        .sort((a, b) => b.score - a.score)[0]?.row;
      if (match && Number(match.amount) > 0) {
        setRenewalFee({ amount: Number(match.amount), currency: match.currency || 'USD' });
      } else {
        setRenewalFee(null);
      }
    }
    loadRenewalFee();
  }, [license?.sector_id, license?.sub_sector_id, license?.category_id]);


  const licensePolicy = license
    ? expiryConfig?.resolveFor({
        sector_id: license.sector_id,
        sub_sector_id: license.sub_sector_id,
        category_id: license.category_id,
      })
    : undefined;
  const periodDays = licensePolicy?.cycle_type === 'periodic' ? (licensePolicy.period_days || 365) : 365;
  const graceDays = licensePolicy?.grace_period_days || 0;
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const validUntilMs = license?.valid_until ? new Date(license.valid_until).getTime() : null;
  const graceEndsMs = validUntilMs !== null ? validUntilMs + graceDays * 86_400_000 : null;
  const graceEndsOnLabel = graceEndsMs !== null ? new Date(graceEndsMs).toLocaleDateString() : '';
  const isWithinGrace = !!license && validUntilMs !== null && graceEndsMs !== null &&
    validUntilMs < todayMs && graceEndsMs >= todayMs;
  const isPastGrace = !!license && (
    (graceEndsMs !== null && graceEndsMs < todayMs) ||
    (license.status === 'expired' && graceDays === 0)
  );
  // Kept for backward references — "expired" in the legal sense = past grace.
  const isLicenseExpired = isPastGrace;

  // Auto-calculated next valid_until based on the sector's renewal policy.
  // Read-only — users cannot override it from the renewal form.
  const computedNewValidUntil = (() => {
    if (!license) return '';
    const base = license.valid_until ? new Date(license.valid_until) : new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // If the license has already expired, extend from today rather than the past date.
    if (base.getTime() < today.getTime()) base.setTime(today.getTime());
    base.setDate(base.getDate() + periodDays);
    return base.toISOString().slice(0, 10);
  })();

  // Resolve the renewal form template for this license.
  // Priority: service named "Renew" → sub_sector_id → sector_id → name contains "Renewal".
  const resolveRenewalTemplate = () => {
    const published = (formTemplates || []).filter(
      (t: any) => t.status === 'published' && t.form_type === 'post_license',
    );
    if (!published.length) return null;

    if (license?.sub_sector_id) {
      const byService = published.filter(
        (t: any) =>
          (t.service_name || t.service || '').toLowerCase() === 'renew' &&
          t.sub_sector_id === license.sub_sector_id,
      );
      if (byService.length) return byService[0];
    }
    if (license?.sub_sector_id) {
      const bySub = published.filter(
        (t: any) => t.sub_sector_id === license.sub_sector_id && /renew/i.test(t.name || ''),
      );
      if (bySub.length) return bySub[0];
    }
    if (license?.sector_id) {
      const bySector = published.filter(
        (t: any) => t.sector_id === license.sector_id && /renew/i.test(t.name || ''),
      );
      if (bySector.length) return bySector[0];
    }
    // Final fallback: any "Renewal" template whose name best matches the license type
    const renewalOnly = published.filter((t: any) => /renew/i.test(t.name || ''));
    if (!renewalOnly.length) return null;
    const type = (license?.license_type || '').toLowerCase();
    const scored = renewalOnly
      .map((t: any) => {
        const name = (t.name || '').toLowerCase();
        let score = 0;
        for (const word of type.split(/[^a-z0-9]+/).filter((w) => w.length > 3)) {
          if (name.includes(word)) score += 1;
        }
        return { t, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.t || renewalOnly[0];
  };

  const startRenewal = async () => {
    if (!license || !user) return;
    if (startingRenewal) return;
    if (!isInternal && !isPastGrace) {
      if (isWithinGrace) {
        toast.error(`License is in grace period until ${graceEndsOnLabel}. Renewal opens after that.`);
      } else {
        toast.error('Renewal is available only after the license grace period has ended.');
      }
      return;
    }
    const renewalLicenseeId = linkedLicenseeId || resolvedLicenseeId || null;
    const isLicenseHolder = !!license.holder_id && license.holder_id === user.id;
    if (!isInternal) {
      // Skip the Primary/PPOC guard when the current user is the license's
      // own holder_id — typical for pre-licensees who were issued a license
      // before a separate Primary User profile was provisioned. In that
      // case a licensee row may not exist yet either, so don't block on it.
      if (!isLicenseHolder) {
        if (!renewalLicenseeId) {
          toast.error('Could not resolve the licensee for this license.');
          return;
        }
        const ok = await accessGuard.verify(renewalLicenseeId, license.sector_id);
        if (!ok) {
          toast.error('You are not authorized to renew this license.');
          return;
        }
      }
    }
    // Guard against duplicate in-flight renewals. If the licensee already has
    // a pending renewal application for this license, surface it instead of
    // inserting a second one.
    await refreshPendingRenewal(license.id);
    if (pendingRenewalAppId) {
      toast.info('A renewal application is already in progress for this license.');
      navigate(`/applications/${pendingRenewalAppId}?tab=form&view=submitted`);
      return;
    }
    const { data: existingPending } = await supabase
      .from('applications' as any)
      .select('id, status')
      .eq('data->>renewal_of_license_id', license.id)
      .in('status', PENDING_RENEWAL_STATUSES as any)
      .order('created_at', { ascending: false })
      .limit(1);
    const existingRow = ((existingPending as any[]) || [])[0];
    if (existingRow?.id) {
      setPendingRenewalAppId(existingRow.id);
      toast.info('A renewal application is already in progress for this license.');
      navigate(`/applications/${existingRow.id}?tab=form&view=submitted`);
      return;
    }
    // Reopen any existing pre-submission renewal (draft or in_progress) for
    // this license instead of inserting a duplicate.
    const { data: existingDraft } = await supabase
      .from('applications' as any)
      .select('id')
      .in('status', IN_PROGRESS_RENEWAL_STATUSES as any)
      .eq('data->>renewal_of_license_id', license.id)
      .eq('data->>is_renewal', 'true')
      .order('created_at', { ascending: false })
      .limit(1);
    const draftRow = ((existingDraft as any[]) || [])[0];
    if (draftRow?.id) {
      setInProgressRenewalAppId(draftRow.id);
      toast.info('A renewal form is already in progress for this license — reopening it.');
      navigate(`/post-licensee/applications/${draftRow.id}/forms?service=Renew`);
      return;
    }
    setStartingRenewal(true);

    try {
      // Locate the original approved application that produced this license.
      // Priority chain — first match wins. Each step checks both top-level
      // columns and `data` JSON keys so legacy rows are still resolvable.
      //   1. licenses.application_id (direct FK)
      //   2. approved app with id === license.data?.application_id (if available)
      //   3. approved/active app whose license_id column matches the license
      //   4. approved app with data.license_id / data.issued_license_id /
      //      data.renewal_of_license_id matching the license id
      //   5. approved app with license_number column or data.license_number
      //   6. approved app whose applicant/licensee/holder reference matches
      //      AND sector/sub_sector/category match (column or data JSON)
      //   7. Fallback: latest approved app for the same applicant + sector
      let originalAppId: string | null = license.application_id || null;
      let originalAppData: any = null;
      const APPROVED_STATUSES = ['approved', 'active'];

      const tryFetchById = async (appId: string) => {
        const { data: row } = await supabase
          .from('applications')
          .select('id, data')
          .eq('id', appId)
          .maybeSingle();
        if ((row as any)?.data) {
          originalAppId = (row as any).id;
          originalAppData = (row as any).data;
        }
      };

      const tryFirstHit = async (query: any) => {
        const { data: rows } = await query
          .order('approved_at', { ascending: false, nullsFirst: false })
          .limit(1);
        const hit = ((rows as any[]) || [])[0];
        if (hit) { originalAppId = hit.id; originalAppData = hit.data || null; }
      };

      // Step 1
      if (originalAppId) await tryFetchById(originalAppId);

      // Step 2 — license.data may carry an application_id pointer
      if (!originalAppData) {
        const dataAppId = (license as any).data?.application_id;
        if (typeof dataAppId === 'string' && dataAppId) await tryFetchById(dataAppId);
      }

      // Step 3 — applications.license_id column
      if (!originalAppData) {
        await tryFirstHit(
          (supabase as any)
            .from('applications')
            .select('id, data, approved_at, created_at')
            .in('status', APPROVED_STATUSES as any)
            .eq('license_id', license.id),
        );
      }

      // Step 4 — license id stored in data JSON
      if (!originalAppData) {
        await tryFirstHit(
          (supabase as any)
            .from('applications')
            .select('id, data, approved_at, created_at')
            .in('status', APPROVED_STATUSES as any)
            .or(
              `data->>license_id.eq.${license.id},` +
              `data->>issued_license_id.eq.${license.id},` +
              `data->>renewal_of_license_id.eq.${license.id}`,
            ),
        );
      }

      // Step 5 — match by license number (column or data JSON)
      if (!originalAppData && license.license_number) {
        await tryFirstHit(
          (supabase as any)
            .from('applications')
            .select('id, data, approved_at, created_at')
            .in('status', APPROVED_STATUSES as any)
            .or(
              `license_number.eq.${license.license_number},` +
              `data->>license_number.eq.${license.license_number}`,
            ),
        );
      }

      // Step 6 — applicant/licensee/holder reference + taxonomy match
      if (!originalAppData && (license.holder_id || linkedLicenseeId)) {
        const candidateIds = [license.holder_id, linkedLicenseeId].filter(Boolean) as string[];
        const idList = candidateIds.join(',');
        const refFilters: string[] = [];
        candidateIds.forEach((cid) => {
          refFilters.push(`applicant_id.eq.${cid}`);
          refFilters.push(`data->>applicant_id.eq.${cid}`);
          refFilters.push(`data->>licensee_id.eq.${cid}`);
          refFilters.push(`data->>holder_id.eq.${cid}`);
        });
        const { data: byRef } = await (supabase as any)
          .from('applications')
          .select('id, data, sector_id, sub_sector_id, category_id, applicant_id, approved_at, created_at')
          .in('status', APPROVED_STATUSES as any)
          .or(refFilters.join(','))
          .order('approved_at', { ascending: false, nullsFirst: false })
          .limit(25);
        const matchTax = (r: any) => {
          const sec = r.sector_id || r.data?.sector_id;
          const sub = r.sub_sector_id || r.data?.sub_sector_id;
          const cat = r.category_id || r.data?.category_id;
          if (license.sector_id && sec && sec !== license.sector_id) return false;
          if (license.sub_sector_id && sub && sub !== license.sub_sector_id) return false;
          if (license.category_id && cat && cat !== license.category_id) return false;
          return true;
        };
        const matched = ((byRef as any[]) || []).find(matchTax);
        if (matched) { originalAppId = matched.id; originalAppData = matched.data || null; }
        void idList;
      }

      // Step 7 — last-resort: latest approved app for same applicant + sector
      if (!originalAppData && license.holder_id && license.sector_id) {
        const { data: fallback } = await (supabase as any)
          .from('applications')
          .select('id, data, approved_at')
          .in('status', APPROVED_STATUSES as any)
          .eq('applicant_id', license.holder_id)
          .eq('sector_id', license.sector_id)
          .order('approved_at', { ascending: false, nullsFirst: false })
          .limit(1);
        const hit = ((fallback as any[]) || [])[0];
        if (hit) { originalAppId = hit.id; originalAppData = hit.data || null; }
      }

      const hasOriginal = !!originalAppData &&
        Array.isArray(originalAppData?.form_template_ids) &&
        originalAppData.form_template_ids.length > 0;

      // Fee/workflow resolution requires a "Renew" service id when present.
      let renewServiceId: string | null = null;
      if (license.sub_sector_id) {
        const { data: services } = await supabase
          .from('services' as any)
          .select('id')
          .eq('name', 'Renew')
          .eq('sub_sector_id', license.sub_sector_id)
          .limit(1);
        renewServiceId = ((services as any[] | null) || [])[0]?.id || null;
      }

      let templateIdsForRenewal: string[] = [];
      let prefillFormsData: Record<string, any> = {};
      let prefillVersionIds: Record<string, string> = {};
      let originalSnapshot: Record<string, any> | null = null;
      let originalVersionSnapshot: Record<string, string> | null = null;
      let originalTemplateIdsSnapshot: string[] | null = null;
      let legacyFallback = false;

      if (hasOriginal) {
        const origTemplateIds: string[] = originalAppData.form_template_ids;
        const origForms: Record<string, any> = (originalAppData.forms_data && typeof originalAppData.forms_data === 'object')
          ? originalAppData.forms_data : {};
        const origVersions: Record<string, string> = (originalAppData.form_version_ids && typeof originalAppData.form_version_ids === 'object')
          ? originalAppData.form_version_ids : {};

        templateIdsForRenewal = origTemplateIds;
        prefillFormsData = JSON.parse(JSON.stringify(origForms));
        prefillVersionIds = JSON.parse(JSON.stringify(origVersions));
        originalSnapshot = JSON.parse(JSON.stringify(origForms));
        originalVersionSnapshot = JSON.parse(JSON.stringify(origVersions));
        originalTemplateIdsSnapshot = [...origTemplateIds];
        if (!renewServiceId) renewServiceId = originalAppData.service_id || null;
      } else {
        // Legacy fallback: try the standalone renewal template, but do not block.
        legacyFallback = true;
        const template = resolveRenewalTemplate();
        if (template) {
          templateIdsForRenewal = [template.id];
          if (!renewServiceId) renewServiceId = (template as any).service_id || null;
        } else {
          templateIdsForRenewal = [];
        }
        toast.info('Original approved application could not be located. This renewal will use the standard renewal form if available.');
      }

      const renewalApplicationId = crypto.randomUUID();

      const insertPayload: any = {
        id: renewalApplicationId,
        applicant_id: user.id,
        license_type: license.license_type,
        status: 'draft',
        data: {
          ...(renewalLicenseeId ? { licensee_id: renewalLicenseeId } : {}),
          type: 'post_license',
          sector_id: license.sector_id,
          sub_sector_id: license.sub_sector_id,
          category_id: license.category_id,
          service_id: renewServiceId,
          service_name: 'Renew',
          service: 'Renew',
          form_template_ids: templateIdsForRenewal,
          forms_data: prefillFormsData,
          form_version_ids: prefillVersionIds,
          ...(originalAppId ? { original_application_id: originalAppId } : {}),
          ...(originalSnapshot ? { original_forms_data: originalSnapshot } : {}),
          ...(originalVersionSnapshot ? { original_form_version_ids: originalVersionSnapshot } : {}),
          ...(originalTemplateIdsSnapshot ? { original_form_template_ids: originalTemplateIdsSnapshot } : {}),
          legacy_renewal_fallback: legacyFallback,
          renewal_of_license_id: license.id,
          renewal_of_license_number: license.license_number,
          computed_new_valid_until: computedNewValidUntil,
          previous_valid_until: license.valid_until,
          is_renewal: true,
        },
        regulator_id: activeRegulator?.id || null,
      };

      const { error } = await supabase
        .from('applications')
        .insert(insertPayload as any)
        .throwOnError();

      if (error) throw error;

      await logAudit({
        action: 'license_renewal_started',
        entityType: 'license',
        entityId: license.id,
        newValue: {
          application_id: renewalApplicationId,
          new_valid_until: computedNewValidUntil,
          original_application_id: originalAppId,
          legacy_renewal_fallback: legacyFallback,
        },
      });

      toast.success('Renewal form opened. Complete it and submit your renewal request.');
      navigate(`/post-licensee/applications/${renewalApplicationId}/forms?service=Renew`);
    } catch (err: any) {
      toast.error('Failed to start renewal: ' + (err?.message || 'Unknown error'));
    } finally {
      setStartingRenewal(false);
    }
  };

  // Auto-trigger when ?action=renew is present. Guard so it never fires twice.
  const autoRenewalTriggeredRef = useRef(false);
  useEffect(() => {
    if (!license) return;
    if (searchParams.get('action') !== 'renew') return;
    if (autoRenewalTriggeredRef.current) return;
    // Wait until form templates have finished loading before auto-firing,
    // otherwise resolveRenewalTemplate() runs against an empty list and
    // surfaces a false "No renewal form is configured" toast.
    if (templatesLoading) return;
    if (!formTemplates || formTemplates.length === 0) return;
    autoRenewalTriggeredRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
    if (pendingRenewalAppId) {
      toast.info('A renewal application is already in progress for this license.');
      navigate(`/applications/${pendingRenewalAppId}?tab=form&view=submitted`);
      return;
    }
    if (inProgressRenewalAppId) {
      toast.info('A renewal form is already in progress for this license — reopening it.');
      navigate(`/post-licensee/applications/${inProgressRenewalAppId}/forms?service=Renew`);
      return;
    }
    if (isPastGrace) {
      startRenewal();
    } else if (isWithinGrace) {
      toast.info(`License is in grace period until ${graceEndsOnLabel}. Renewal opens after that.`);
    } else {
      toast.info('Renewal is available only after the license grace period has ended.');
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [license, formTemplates, templatesLoading]);

  const openSignedUrl = async (url: string) => {
    // Fetch as blob and trigger a same-origin download to avoid Chrome blocking
    // cross-origin PDF navigations from the preview iframe.
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `license-certificate-${license?.license_number || 'certificate'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      // Fallback: try opening in a new tab
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const downloadCertificate = async () => {
    if (!license) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-license-certificate', {
        body: { mode: 'download', license_id: license.id },
      });
      if (error || (data as any)?.error) {
        // Try generating then download
        await supabase.functions.invoke('generate-license-certificate', {
          body: { mode: 'generate', license_id: license.id },
        });
        const retry = await supabase.functions.invoke('generate-license-certificate', {
          body: { mode: 'download', license_id: license.id },
        });
        const url = (retry.data as any)?.url;
        if (!url) { toast.error('Failed to load certificate'); setDownloading(false); return; }
        await openSignedUrl(url);
      } else {
        await openSignedUrl((data as any).url);
      }
    } finally {
      setDownloading(false);
    }
  };


  const handleAction = async (actionType: string, newStatus: LicenseStatus) => {
    if (!license || !user) return;
    if (MANDATORY_REASON_ACTIONS.has(actionType) && reason.trim().length < MIN_REASON_LEN) {
      toast.error(`Please provide a justification of at least ${MIN_REASON_LEN} characters.`);
      return;
    }
    setProcessing(true);
    const oldStatus = license.status;

    await supabase.from('license_actions' as any).insert({
      license_id: license.id, action_type: actionType, actor_id: user.id,
      reason: reason || null, old_status: oldStatus, new_status: newStatus,
    } as any);

    await supabase.from('licenses' as any).update({ status: newStatus, updated_at: new Date().toISOString() } as any).eq('id', license.id);

    // Mirror revocation/cancellation onto the linked licensee row
    if (newStatus === 'revoked' || newStatus === 'cancelled') {
      await supabase.from('licensees' as any).update({ status: newStatus } as any).eq('license_id', license.id);
    }

    await logAudit({ action: `license_${actionType}`, entityType: 'license', entityId: license.id, oldValue: { status: oldStatus }, newValue: { status: newStatus, reason } });

    const eventKeyMap: Record<string, string> = {
      suspension: 'license.suspended',
      revocation: 'license.revoked',
      renewal: 'license.renewed',
      reinstatement: 'license.reinstated',
      cancellation: 'license.cancelled',
    };
    const eventKey = eventKeyMap[actionType] || 'license.status_changed';
    dispatchNotificationEvent({
      event_key: eventKey,
      entity_type: 'license',
      entity_id: license.id,
      payload: {
        license_id: license.id,
        license_number: license.license_number,
        license_type: license.license_type,
        old_status: oldStatus,
        new_status: newStatus,
        reason: reason || '',
        valid_until: license.valid_until ? new Date(license.valid_until).toISOString().slice(0, 10) : '',
        holder_user_id: license.holder_id,
      },
    });

    toast.success(`License ${actionType} successful`);
    setLicense(prev => prev ? { ...prev, status: newStatus } : prev);
    setReason('');
    setProcessing(false);

    const { data: acts } = await supabase.from('license_actions' as any).select('*').eq('license_id', license.id).order('created_at', { ascending: false });
    if (acts) setActions(acts as any);
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  if (!license) return <DashboardLayout><div className="text-center py-12 text-muted-foreground">License not found</div></DashboardLayout>;

  const revokeDisabled = processing || reason.trim().length < MIN_REASON_LEN;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`License ${license.license_number}`}
          description={formatTaxonomyLabel(license.license_type)}
          backHref="/licenses"
          backLabel="Back to Licenses"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadCertificate} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
                Signed Certificate
              </Button>
              <LicenseStatusBadge status={license.status} validUntil={license.valid_until} gracePeriodDays={graceDays} />
            </div>
          }
        />

        {(() => {
          const alertMap: Record<string, { title: string; variant: 'destructive' | 'default'; icon: any; actionTypes: string[] }> = {
            suspended: { title: 'This license is currently suspended.', variant: 'default', icon: AlertTriangle, actionTypes: ['suspension'] },
            revoked: { title: 'This license has been revoked.', variant: 'destructive', icon: Ban, actionTypes: ['revocation'] },
            cancelled: { title: 'This license has been cancelled.', variant: 'destructive', icon: Ban, actionTypes: ['cancellation'] },
            expired: { title: 'This license has expired.', variant: 'default', icon: AlertTriangle, actionTypes: [] },
          };
          const meta = alertMap[license.status];
          if (!meta) return null;
          const latest = actions.find(a => meta.actionTypes.includes(a.action_type)) || actions.find(a => a.new_status === license.status);
          const Icon = meta.icon;
          return (
            <Alert variant={meta.variant} className={meta.variant === 'default' ? 'border-warning/40 bg-warning/5' : ''}>
              <Icon className="h-4 w-4" />
              <AlertTitle>{meta.title}</AlertTitle>
              {latest && (
                <AlertDescription className="mt-1 space-y-1 text-sm">
                  <div>Effective: {new Date(latest.created_at).toLocaleString()}</div>
                  {latest.reason && <div>Justification: {latest.reason}</div>}
                </AlertDescription>
              )}
            </Alert>
          );
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>License Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">License Number</p><p className="font-mono font-medium">{license.license_number}</p></div>
                  <div><p className="text-sm text-muted-foreground">Type</p><p className="font-medium">{formatTaxonomyLabel(license.license_type)}</p></div>
                  <div><p className="text-sm text-muted-foreground">Issued</p><p>{new Date(license.issued_at).toLocaleDateString()}</p></div>
                  <div><p className="text-sm text-muted-foreground">Valid From</p><p>{new Date(license.valid_from).toLocaleDateString()}</p></div>
                  <div><p className="text-sm text-muted-foreground">Valid Until</p><p>{license.valid_until ? new Date(license.valid_until).toLocaleDateString() : 'No Expiry'}</p></div>
                  {license.conditions && <div className="col-span-2"><p className="text-sm text-muted-foreground">Conditions</p><p className="text-sm">{license.conditions}</p></div>}
                </div>
              </CardContent>
            </Card>

            {isInternal && license.status !== 'revoked' && license.status !== 'cancelled' && (
              <Card>
                <CardHeader><CardTitle>License Actions</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Justification / Notes <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder={`Required for revoke/suspend/cancel (min ${MIN_REASON_LEN} characters)...`}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {reason.trim().length}/{MIN_REASON_LEN}+ characters
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {license.status === 'active' && (
                      <>
                        <Button variant="outline" onClick={() => handleAction('suspension', 'suspended')} disabled={revokeDisabled}><PauseCircle className="h-4 w-4 mr-1" />Suspend</Button>
                        <Button variant="destructive" onClick={() => handleAction('revocation', 'revoked')} disabled={revokeDisabled}><XCircle className="h-4 w-4 mr-1" />Revoke</Button>
                        {pendingRenewalAppId ? (
                          <Button variant="outline" onClick={() => navigate(`/applications/${pendingRenewalAppId}?tab=form&view=submitted`)}>
                            <RefreshCw className="h-4 w-4 mr-1" />Renewal in progress
                          </Button>
                        ) : inProgressRenewalAppId ? (
                          <Button variant="outline" onClick={() => navigate(`/post-licensee/applications/${inProgressRenewalAppId}/forms?service=Renew`)}>
                            <RefreshCw className="h-4 w-4 mr-1" />Continue Renewal
                          </Button>
                        ) : (
                          <Button variant="outline" onClick={startRenewal} disabled={processing || startingRenewal}>
                            {startingRenewal ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                            Renew
                          </Button>
                        )}
                      </>
                    )}
                    {license.status === 'suspended' && (
                      <>
                        <Button onClick={() => handleAction('reinstatement', 'active')} disabled={processing}><RotateCcw className="h-4 w-4 mr-1" />Reinstate</Button>
                        <Button variant="destructive" onClick={() => handleAction('cancellation', 'cancelled')} disabled={revokeDisabled}><XCircle className="h-4 w-4 mr-1" />Cancel</Button>
                      </>
                    )}
                    {license.status === 'expired' && (
                      pendingRenewalAppId ? (
                        <Button variant="outline" onClick={() => navigate(`/applications/${pendingRenewalAppId}?tab=form&view=submitted`)}>
                          <RefreshCw className="h-4 w-4 mr-1" />Renewal in progress
                        </Button>
                      ) : inProgressRenewalAppId ? (
                        <Button variant="outline" onClick={() => navigate(`/post-licensee/applications/${inProgressRenewalAppId}/forms?service=Renew`)}>
                          <RefreshCw className="h-4 w-4 mr-1" />Continue Renewal
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={startRenewal} disabled={processing || startingRenewal}>
                          {startingRenewal ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                          Renew
                        </Button>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Renewal panel visible to license holder only after grace period has ended */}
            {!isInternal && license.valid_until && isPastGrace && (() => {
              const days = Math.ceil((new Date(license.valid_until).getTime() - todayMs) / 86_400_000);
              const fee = renewalFee
                ? `${renewalFee.amount} ${renewalFee.currency} (paid renewal)`
                : 'Free';
              return (
                <Card>
                  <CardHeader><CardTitle>Renewal</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      This license expired {Math.abs(days)} day{Math.abs(days) === 1 ? '' : 's'} ago. Grace period ended on {graceEndsOnLabel}.
                    </p>
                    <p className="text-sm"><span className="text-muted-foreground">Renewal fee: </span><span className="font-medium">{fee}</span></p>
                    {pendingRenewalAppId ? (
                      <Button variant="outline" onClick={() => navigate(`/applications/${pendingRenewalAppId}?tab=form&view=submitted`)}>
                        <RefreshCw className="h-4 w-4 mr-1" />Renewal in progress
                      </Button>
                    ) : inProgressRenewalAppId ? (
                      <Button onClick={() => navigate(`/post-licensee/applications/${inProgressRenewalAppId}/forms?service=Renew`)}>
                        <RefreshCw className="h-4 w-4 mr-1" />Continue Renewal
                      </Button>
                    ) : (
                      <Button onClick={startRenewal} disabled={startingRenewal}>
                        {startingRenewal ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                        Renew License
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })()}


            {/* Informational panel while inside the grace period */}
            {!isInternal && license.valid_until && isWithinGrace && (
              <Card>
                <CardHeader><CardTitle>Grace Period Active</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Your license expired on {new Date(license.valid_until).toLocaleDateString()} and is currently in the grace period.
                    It remains valid until <span className="font-medium text-foreground">{graceEndsOnLabel}</span>. You can renew once the grace period ends.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>


          <div>
            <Card>
              <CardHeader><CardTitle className="text-base">Action History</CardTitle></CardHeader>
              <CardContent>
                {actions.length === 0 ? <p className="text-sm text-muted-foreground">No actions recorded</p> : (
                  <div className="space-y-3">
                    {actions.map(a => (
                      <div key={a.id} className="border-l-2 border-border pl-3 py-1">
                        <Badge variant="outline" className="text-xs capitalize mb-1">{a.action_type.replace(/_/g, ' ')}</Badge>
                        <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                        <p className="text-xs">{a.old_status} → {a.new_status}</p>
                        {a.reason && <p className="text-xs text-muted-foreground italic mt-1">"{a.reason}"</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
