import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-registry`;

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

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <Link to="/registry/licensees" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-3 w-3" /> Back to Register
        </Link>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
        {data && (
          <>
            <h1 className="text-2xl font-bold">{data.license.licensee_name || 'Licensee'}</h1>
            <p className="text-sm text-muted-foreground font-mono mt-1">{data.license.license_number}</p>
            <div className="grid gap-3 sm:grid-cols-2 mt-6">
              <Field label="Licence type" value={<Badge variant="outline">{data.license.license_type}</Badge>} />
              <Field label="Sector" value={data.license.sector_name || '—'} />
              <Field label="Issue date" value={data.license.issue_date || '—'} />
              <Field label="Expiry date" value={data.license.expiry_date || '—'} />
              <Field label="Status" value={<Badge className="bg-green-600">Active</Badge>} />
              <Field label="Published enforcements" value={data.enforcement_count} />
            </div>
            <Card className="p-4 mt-6 text-xs text-muted-foreground">
              Only publishable regulatory information is shown. Confidential supervisory data is excluded.
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
