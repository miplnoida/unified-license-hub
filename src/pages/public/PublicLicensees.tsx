import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Search } from 'lucide-react';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-registry`;

type Row = {
  id: string;
  license_number: string;
  license_type: string;
  issue_date: string | null;
  expiry_date: string | null;
  licensee_name: string | null;
  sector_name: string | null;
};

export default function PublicLicensees() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const load = async (searchTerm = q, off = 0) => {
    setLoading(true);
    try {
      const url = `${FN_URL}?action=licensees&limit=${limit}&offset=${off}${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ''}`;
      const res = await fetch(url).then((r) => r.json());
      setRows(res.rows || []);
      setTotal(res.total || 0);
      setOffset(off);
    } finally { setLoading(false); }
  };

  useEffect(() => { load('', 0); }, []);

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <Link to="/registry" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-3 w-3" /> Back to Registry
        </Link>
        <h1 className="text-2xl font-bold mb-1">Licensee Register</h1>
        <p className="text-sm text-muted-foreground mb-6">All currently active licences.</p>

        <form
          className="flex gap-2 mb-4"
          onSubmit={(e) => { e.preventDefault(); load(q, 0); }}
        >
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by licence number…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Button type="submit" disabled={loading}>Search</Button>
        </form>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Licence #</th>
                  <th className="px-4 py-2 font-medium">Licensee</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Sector</th>
                  <th className="px-4 py-2 font-medium">Issued</th>
                  <th className="px-4 py-2 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No records.</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link to={`/registry/licensees/${r.id}`} className="text-primary hover:underline">{r.license_number}</Link>
                    </td>
                    <td className="px-4 py-2">{r.licensee_name || '—'}</td>
                    <td className="px-4 py-2"><Badge variant="outline">{r.license_type}</Badge></td>
                    <td className="px-4 py-2">{r.sector_name || '—'}</td>
                    <td className="px-4 py-2">{r.issue_date || '—'}</td>
                    <td className="px-4 py-2">{r.expiry_date || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted-foreground">{total} total · showing {offset + 1}–{Math.min(offset + rows.length, total)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => load(q, Math.max(0, offset - limit))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={offset + limit >= total || loading} onClick={() => load(q, offset + limit)}>Next</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
