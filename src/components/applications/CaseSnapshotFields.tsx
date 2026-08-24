/**
 * Case Snapshot fields (Details tab)
 *
 * Shows the identity / status facts that used to live in the Decision tab's
 * "Case Snapshot" block. Only the fields that are NOT already shown on the
 * Details tab are rendered here (application number, licence type, taxonomy,
 * created/submitted dates stay where they are), so nothing is duplicated.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { APPLICATION_STATUS_LABELS } from '@/types/platform';

interface Props {
  application: any;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

export function CaseSnapshotFields({ application }: Props) {
  const appData = (application?.data as any) || {};
  const [applicant, setApplicant] = useState<any>(null);
  const [instance, setInstance] = useState<any>(null);
  const [stepName, setStepName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const applicantId = application?.applicant_id as string | undefined;
      if (!applicantId) return;
      const [{ data: profile }, { data: preUser }, { data: wi }] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', applicantId).maybeSingle(),
        supabase.from('pre_license_users').select('full_name, email').eq('id', applicantId).maybeSingle(),
        supabase
          .from('workflow_instances')
          .select('*')
          .eq('entity_type', 'application')
          .eq('entity_id', application.id)
          .in('status', ['active', 'paused'])
          .order('updated_at', { ascending: false }),
      ]);
      if (cancelled) return;
      setApplicant((profile as any) || (preUser as any) || null);
      const rows = ((wi as any[]) || []);
      const row = rows.find((r) => r.status === 'active') || rows.find((r) => r.status === 'paused') || null;
      setInstance(row);
      if (row?.current_step_id) {
        const { data: step } = await supabase
          .from('approval_steps')
          .select('name')
          .eq('id', row.current_step_id)
          .maybeSingle();
        if (!cancelled) setStepName((step as any)?.name || null);
      }
    })();
    return () => { cancelled = true; };
  }, [application?.id, application?.applicant_id]);

  const applicantLabel =
    applicant?.full_name ||
    applicant?.email ||
    (appData.applicant_name as string) ||
    (appData.full_name as string) ||
    (appData.email as string) ||
    '—';
  const applicantEmail = applicant?.email || (appData.email as string) || null;
  const entityName =
    (appData.company_name as string) ||
    (appData.entity_name as string) ||
    (appData.organization_name as string) ||
    null;

  const currentStepName = useMemo(() => {
    if (stepName) return stepName;
    const snap: any = instance?.version_snapshot;
    const steps = Array.isArray(snap?.steps) ? snap.steps : [];
    const key = instance?.current_step_key || instance?.current_step_id;
    if (!key) return null;
    const found = steps.find((s: any) => s.local_id === key || s.id === key);
    return found?.name || found?.label || null;
  }, [stepName, instance]);

  return (
    <>
      <Field
        label="Status"
        value={
          APPLICATION_STATUS_LABELS[application?.status as keyof typeof APPLICATION_STATUS_LABELS] ||
          application?.status ||
          '—'
        }
      />
      {/* Applicant / entity identity is rendered by ApplicantLicenseeIdentity
          on the Details tab, so it is not repeated here. */}

      <Field label="Current Step" value={currentStepName || '—'} />
    </>
  );
}

export default CaseSnapshotFields;
