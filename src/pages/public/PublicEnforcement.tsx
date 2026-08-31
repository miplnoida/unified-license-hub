import { formatBaseMoney } from '@/lib/money';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-registry`;

type Row = {
  id: string;
  enforcement_type: string;
  status: string;
  decision_outcome: string | null;
  decision_rationale: string | null;
  decision_at: string | null;
  penalty_amount: number | null;
  licensee_name: string | null;
};

export default function PublicEnforcement() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const limit = 25;

  const load = async (off = 0) => {
    setLoading(true);
    try {
      const res = await fetch(`${FN_URL}?action=enforcement&limit=${limit}&offset=${off}`).then((r) => r.json());
      setRows(res.rows || []);
      setTotal(res.total || 0);
      setOffset(off);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(0); }, []);

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <Link to="/registry" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-3 w-3" /> Back to Registry
        </Link>
        <h1 className="text-2xl font-bold mb-1">Published Enforcement Outcomes</h1>
        <p className="text-sm text-muted-foreground mb-6">Decisions and penalties from closed enforcement cases.</p>

        <div className="space-y-3">
          {rows.length === 0 && !loading && <p className="text-sm text-muted-foreground">No published outcomes.</p>}
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline">{r.enforcement_type}</Badge>
                    <Badge className="bg-slate-600">{r.status}</Badge>
                    {r.decision_outcome && <Badge variant="secondary">{r.decision_outcome}</Badge>}
                    {r.decision_at && <span className="text-xs text-muted-foreground">{new Date(r.decision_at).toLocaleDateString()}</span>}
                  </div>
                  <div className="font-medium">{r.licensee_name || 'Unnamed licensee'}</div>
                  {r.decision_rationale && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{r.decision_rationale}</p>
                  )}
                </div>
                {r.penalty_amount != null && r.penalty_amount > 0 && (
                  <div className="text-right shrink-0">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Penalty</div>
                    <div className="text-lg font-semibold text-destructive">{formatBaseMoney(r.penalty_amount)}</div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted-foreground">{total} total · showing {rows.length === 0 ? 0 : offset + 1}–{Math.min(offset + rows.length, total)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => load(Math.max(0, offset - limit))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={offset + limit >= total || loading} onClick={() => load(offset + limit)}>Next</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
