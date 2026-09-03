/**
 * EPIC 4 / W6 — inspection convergence compatibility routes.
 *
 * `public.inspections` / `public.inspection_findings` are retired: zero current
 * rows, zero code readers, zero writers (the `inspection_create`,
 * `inspection_lifecycle_save`, `inspection_finding_save` and
 * `inspection_finding_escalate` writers were removed). Inspection-style
 * supervisory activity is now recorded only on the canonical examination engine
 * (`examinations` → scope → RFI/evidence/workpaper → `supervisory_finding` →
 * remediation → validation → reassessment).
 *
 * `/inspections` and `/inspections/schedule` therefore redirect to the
 * canonical register and schedule. `/inspections/:id` must NEVER resolve a
 * legacy identifier against an unrelated canonical record, so it renders an
 * explicit read-only notice instead of a silent redirect.
 */
import { Navigate, useLocation, useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Archive } from 'lucide-react';

export function LegacyInspectionRegisterRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`/prudential/examinations${search}${hash}`} replace />;
}

export function LegacyInspectionScheduleRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`/supervision/examination-schedule${search}${hash}`} replace />;
}

export default function LegacyInspectionRecordNotice() {
  const { id } = useParams<{ id: string }>();
  return (
    <DashboardLayout>
      <PageHeader
        title="Retired inspection record"
        description="Inspection records are no longer a source of supervisory truth"
      />
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Archive className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                The legacy inspection case store was retired during the supervisory
                convergence programme. It holds no records, and this identifier is
                deliberately not mapped onto a canonical record — doing so could open an
                unrelated examination.
              </p>
              <p className="font-mono text-xs">Legacy reference: {id ?? '—'}</p>
              <p>
                Onsite, offsite, thematic and follow-up supervisory activity — including
                scoping, information requests, workpapers, findings, remediation and
                validation — is recorded on the canonical examination engine.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link to="/prudential/examinations">Open examination register</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/supervision/examination-schedule">View activity schedule</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
