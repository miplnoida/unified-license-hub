/**
 * RDM-ENTITY-001 Wave B — Public Regulated Entity Register (`/registry/entities`).
 *
 * Transparency is entity-centred: the public sees the regulated entity and the
 * licences it holds, not a flat list of licence rows. What is published is
 * decided server-side by the entity's publication policy.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Search, Loader2 } from 'lucide-react';
import { usePublicEntityRegister } from '@/hooks/useWaveB';

const PAGE = 25;

export default function PublicEntityRegister() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const { data: rows = [], isLoading } = usePublicEntityRegister({ query, limit: PAGE, offset: page * PAGE });

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link to="/registry" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Registry
        </Link>
        <h1 className="mb-1 text-2xl font-bold">Regulated Entity Register</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Every published regulated entity and the licences it currently holds.
        </p>

        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(0); setQuery(term.trim()); }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search by entity or trading name…"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={isLoading}>Search</Button>
        </form>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Entity</th>
                  <th className="px-4 py-2 font-medium">Sector</th>
                  <th className="px-4 py-2 font-medium">Licences held</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No published entities match this search.</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.slug} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.legal_name}</p>
                      {r.trading_name && r.trading_name !== r.legal_name && (
                        <p className="text-xs text-muted-foreground">trading as {r.trading_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.sector || '—'}</td>
                    <td className="px-4 py-3">
                      {r.licences.length === 0
                        ? <span className="text-muted-foreground">Not published</span>
                        : (
                          <div className="flex flex-wrap gap-1">
                            {r.licences.slice(0, 3).map((l) => (
                              <Badge key={l.license_number || l.license_type} variant="outline" className="font-mono text-xs">
                                {l.license_number || l.license_type}
                              </Badge>
                            ))}
                            {r.licences.length > 3 && <Badge variant="outline" className="text-xs">+{r.licences.length - 3}</Badge>}
                          </div>
                        )}
                    </td>
                    <td className="px-4 py-3">
                      {r.entity_status ? <Badge variant="outline" className="text-xs">{r.entity_status}</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/registry/entities/${r.slug}`} className="text-sm text-primary underline">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button variant="outline" size="sm" disabled={rows.length < PAGE} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </main>
    </div>
  );
}
