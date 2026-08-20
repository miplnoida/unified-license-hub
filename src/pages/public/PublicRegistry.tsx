import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Card } from '@/components/ui/card';
import { Search, Building2, Gavel, Shield, ChevronRight } from 'lucide-react';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-registry`;

export default function PublicRegistry() {
  const [stats, setStats] = useState<{ active_licenses: number; published_enforcements: number; sectors: number } | null>(null);

  useEffect(() => {
    fetch(`${FN_URL}?action=stats`).then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <header className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Shield className="h-4 w-4" /> Public Transparency
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Public Registry</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Search the Regulated Entity Register and view published enforcement outcomes. All information here is
            publishable and updated in real time.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <StatCard label="Active licensees" value={stats?.active_licenses ?? '—'} />
          <StatCard label="Published enforcement outcomes" value={stats?.published_enforcements ?? '—'} />
          <StatCard label="Regulated sectors" value={stats?.sectors ?? '—'} />
        </div>

        {/* §21 — the Regulated Entity Register and Enforcement Outcomes are the
            two leading products; the legacy licensee-only register is demoted
            to a small link so the two registers are not presented as
            competing products. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <RegistryTile
            to="/registry/entities"
            icon={<Building2 className="h-5 w-5" />}
            title="Regulated Entity Register"
            desc="Entity-centred view: every licence held by a regulated entity, plus previous names and status history."
            featured
          />
          <RegistryTile
            to="/registry/enforcement"
            icon={<Gavel className="h-5 w-5" />}
            title="Enforcement Outcomes"
            desc="Published decisions, penalties and sanctions."
            featured
          />
        </div>

        <div className="mt-6 flex justify-end">
          <Link
            to="/registry/licensees"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Legacy view: Licensee Register <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function RegistryTile({
  to, icon, title, desc, featured,
}: { to: string; icon: React.ReactNode; title: string; desc: string; featured?: boolean }) {
  return (
    <Link to={to}>
      <Card className={`p-5 hover:border-primary transition-colors h-full ${featured ? 'border-primary/40' : ''}`}>
        <div className="flex items-center gap-2 text-primary mb-1">{icon}<span className="text-sm font-medium">Open</span></div>
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground mt-1">{desc}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-3"><Search className="h-3 w-3" /> Search & filter</div>
      </Card>
    </Link>
  );
}
