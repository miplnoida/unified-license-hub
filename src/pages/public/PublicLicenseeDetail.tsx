/**
 * Public regulatory record for a licence — /registry/licensees/:id
 *
 * This page is a PUBLIC REGISTER RECORD, not an entity dashboard. It shows only
 * fields the public registry service is authorised to publish. It must never
 * infer that the visitor is connected to the entity being viewed — membership
 * is determined only after sign-in / onboarding.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, Gavel } from 'lucide-react';
import { PublicInfoBadge, SecureServiceBadge, SignInCta } from '@/components/public/AccessBadges';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-registry`;

const STATUS_TONE: Record<string, string> = {
  active: 'bg-green-600 text-white',
  suspended: 'bg-amber-600 text-white',
  expired: 'bg-muted text-muted-foreground',
  revoked: 'bg-destructive text-destructive-foreground',
  surrendered: 'bg-muted text-muted-foreground',
};

export default function PublicLicenseeDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${FN_URL}?action=licensee&id=${id}`)
      .then((r) => r.json())
      .then((res) => { if (res.error) setErr(res.error); else setData(res); })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const lic = data?.license;
  const status = (lic?.status || '').toLowerCase();

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <Link to="/registry/licensees" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-3 w-3" /> Back to Register
        </Link>

        <PublicInfoBadge />

        {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
        {err && <p className="mt-4 text-sm text-destructive">{err}</p>}

        {lic && (
          <>
            <h1 className="mt-3 text-2xl font-bold">{lic.licensee_name || 'Licensee'}</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{lic.license_number}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Field label="Regulated entity / legal name" value={lic.licensee_name || 'Not published'} />
              <Field label="Trading name" value={lic.trading_name || 'Not published'} />
              <Field label="Licence number" value={<span className="font-mono">{lic.license_number || '—'}</span>} />
              <Field
                label="Licence type / category"
                value={<Badge variant="outline">{lic.license_type || 'Not published'}</Badge>}
              />
              <Field label="Regulated sector" value={lic.sector_name || 'Not published'} />
              <Field
                label="Licence status"
                value={
                  <Badge className={STATUS_TONE[status] || 'bg-muted text-muted-foreground'}>
                    {lic.status || 'Not published'}
                  </Badge>
                }
              />
              <Field label="Issue / effective date" value={lic.issue_date || 'Not published'} />
              <Field label="Expiry date" value={lic.expiry_date || 'Not applicable'} />
              <Field
                label="Permitted activities"
                value={lic.permitted_activities || 'Not published for this licence'}
              />
              <Field
                label="Public restrictions / conditions"
                value={lic.public_conditions || 'None published'}
              />
              <Field label="Previous names" value={lic.previous_names || 'None published'} />
              <Field
                label="Published enforcement outcomes"
                value={
                  <span className="inline-flex items-center gap-2">
                    <Gavel className="h-3.5 w-3.5 text-muted-foreground" />
                    {data.enforcement_count ?? 0}
                    {(data.enforcement_count ?? 0) > 0 && (
                      <Link to="/registry/enforcement" className="text-xs text-primary underline">
                        View register
                      </Link>
                    )}
                  </span>
                }
              />
            </div>

            {/* Clearly separated secure-portal panel. Does NOT imply membership. */}
            <Card className="mt-8 border-amber-500/40 bg-amber-500/5">
              <CardHeader className="pb-2">
                <SecureServiceBadge className="w-fit" />
                <CardTitle className="pt-2 text-base">
                  Are you an authorised representative of this entity?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Regulatory submissions, correspondence and requests are only available inside the
                  secure entity portal. Viewing this public record does not give you access to it —
                  your organisation and authority are verified after sign-in or portal onboarding.
                </p>
                <div className="flex flex-wrap gap-2">
                  <SignInCta label="Sign In to Entity Portal" target="/dashboard" size="sm" />
                  <Button asChild variant="outline" size="sm">
                    <Link to="/register/entity">
                      <Building2 className="mr-1.5 h-3.5 w-3.5" /> Request / Connect Portal Access
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/licensee-services">Licensee services</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6 p-4 text-xs text-muted-foreground">
              Official regulator disclaimer: this record reproduces only regulatory information
              authorised for publication and may not reflect changes still under assessment.
              Confidential supervisory data is excluded. The register is provided for information
              purposes; for confirmation of an entity’s regulatory status contact the regulator.
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </Card>
  );
}
