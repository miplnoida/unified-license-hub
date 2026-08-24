/**
 * Applicant & Licensee identity block (Application Detail → Details tab).
 *
 * Resolution precedence:
 *  Licensee/Company name : linked licensee -> registration entity_name -> snapshot
 *  Licensee/Company email: entity primary contact -> registration email -> snapshot
 *  Applicant name/email  : snapshot (historical) -> profile -> pre-license user
 *
 * Values already persisted in `applications.data` are preferred so historical
 * applications keep the identity captured at submission time. No rows are written.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface Props {
  application: any;
}

interface Resolved {
  companyName: string | null;
  companyEmail: string | null;
  applicantName: string | null;
  applicantEmail: string | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value || '—'}</p>
    </div>
  );
}

export function ApplicantLicenseeIdentity({ application }: Props) {
  const data = (application?.data as any) || {};
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const applicantId = application?.applicant_id as string | undefined;
      const entityId = application?.entity_id as string | undefined;

      const [profileRes, preUserRes, licenseeRes] = await Promise.all([
        applicantId
          ? supabase.from('profiles').select('full_name, email').eq('id', applicantId).maybeSingle()
          : Promise.resolve({ data: null } as any),
        applicantId
          ? supabase
              .from('pre_license_users')
              .select('full_name, email, entity_name')
              .eq('id', applicantId)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        entityId
          ? supabase.from('licensees').select('name').eq('id', entityId).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

      const profile: any = profileRes?.data || null;
      const preUser: any = preUserRes?.data || null;
      const licensee: any = licenseeRes?.data || null;

      // Entity primary contact email (approved membership -> profile email).
      let entityContactEmail: string | null = null;
      if (entityId) {
        const { data: memberships } = await supabase
          .from('entity_user_memberships')
          .select('user_id, status, created_at')
          .eq('entity_id', entityId)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .limit(5);
        const userIds = ((memberships as any[]) || []).map(m => m.user_id).filter(Boolean);
        if (userIds.length > 0) {
          const { data: contactProfiles } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', userIds);
          const byId = new Map(((contactProfiles as any[]) || []).map(p => [p.id, p.email]));
          for (const id of userIds) {
            const email = byId.get(id);
            if (email) {
              entityContactEmail = email as string;
              break;
            }
          }
        }
      }

      if (cancelled) return;

      const snapshotCompanyName =
        (data.company_name as string) || (data.entity_name as string) || (data.organization_name as string) || null;
      const snapshotCompanyEmail =
        (data.company_email as string) || (data.entity_email as string) || (data.organization_email as string) || null;
      const snapshotApplicantName = (data.applicant_name as string) || (data.full_name as string) || null;
      const snapshotApplicantEmail = (data.applicant_email as string) || (data.email as string) || null;

      setResolved({
        companyName: licensee?.name || preUser?.entity_name || snapshotCompanyName,
        companyEmail: entityContactEmail || snapshotCompanyEmail || null,
        applicantName: snapshotApplicantName || profile?.full_name || preUser?.full_name || null,
        applicantEmail: snapshotApplicantEmail || profile?.email || preUser?.email || null,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [application?.id, application?.applicant_id, application?.entity_id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Resolving identity…
      </div>
    );
  }

  return (
    <>
      <Field label="Licensee / Company Name" value={resolved?.companyName || null} />
      <Field label="Licensee / Company Email" value={resolved?.companyEmail || null} />
      <Field label="Applicant Name" value={resolved?.applicantName || null} />
      <Field label="Applicant Email" value={resolved?.applicantEmail || null} />
    </>
  );
}

export default ApplicantLicenseeIdentity;
