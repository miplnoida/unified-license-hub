import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ExternalLink, LayoutDashboard } from 'lucide-react';

const sb = supabase as any;

export default function ConductEntitiesList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['conduct-entities'],
    queryFn: async () => {
      const { data: lics, error } = await sb.from('licensees')
        .select('id, name, status, sector_id, sub_sector_id, sectors(name), sub_sectors(name)')
        .order('name').limit(500);
      if (error) throw new Error(error.message);
      const ids = (lics ?? []).map((r: any) => r.id);
      if (!ids.length) return [];
      const [{ data: cmpl }, { data: alrt }, { data: acts }, { data: inv }] = await Promise.all([
        sb.from('complaints').select('licensee_id, status, severity').in('licensee_id', ids),
        sb.from('conduct_alerts').select('licensee_id, status').in('licensee_id', ids),
        sb.from('conduct_actions').select('entity_id, status').in('entity_id', ids),
        sb.from('conduct_investigations').select('licensee_id, status').in('licensee_id', ids),
      ]);
      return (lics ?? []).map((l: any) => {
        const cs = (cmpl ?? []).filter((x: any) => x.licensee_id === l.id);
        const al = (alrt ?? []).filter((x: any) => x.licensee_id === l.id);
        const ac = (acts ?? []).filter((x: any) => x.entity_id === l.id);
        const iv = (inv ?? []).filter((x: any) => x.licensee_id === l.id);
        return {
          ...l,
          complaints_open: cs.filter((x: any) => !['resolved','closed','rejected'].includes(x.status)).length,
          complaints_high: cs.filter((x: any) => ['high','critical'].includes(x.severity)).length,
          alerts_open: al.filter((x: any) => x.status === 'open').length,
          actions_open: ac.filter((x: any) => !['completed','waived','cancelled'].includes(x.status)).length,
          investigations_open: iv.filter((x: any) => x.status !== 'closed').length,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((r: any) => r.name?.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader title="Market Conduct Entities" description="Supervised entity universe with rolled-up complaint, alert, action and investigation counts." />
        <div className="flex gap-3">
          <Input placeholder="Search entity…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        </div>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Licence</TableHead>
                    <TableHead className="text-right">Open complaints</TableHead>
                    <TableHead className="text-right">High/Critical</TableHead>
                    <TableHead className="text-right">Open alerts</TableHead>
                    <TableHead className="text-right">Open actions</TableHead>
                    <TableHead className="text-right">Open investigations</TableHead>
                    <TableHead className="w-40 text-right">Conduct 360</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No entities found.</TableCell></TableRow>
                  )}
                  {filtered.map((r: any) => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/conduct/entities/${r.id}`)}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.sectors?.name || '—'}{r.sub_sectors?.name ? ` / ${r.sub_sectors.name}` : ''}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{r.status || 'unknown'}</Badge></TableCell>
                      <TableCell className="text-right font-mono">{r.complaints_open}</TableCell>
                      <TableCell className="text-right font-mono">{r.complaints_high}</TableCell>
                      <TableCell className="text-right font-mono">{r.alerts_open}</TableCell>
                      <TableCell className="text-right font-mono">{r.actions_open}</TableCell>
                      <TableCell className="text-right font-mono">{r.investigations_open}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); navigate(`/conduct/entities/${r.id}/360`); }}
                        >
                          <LayoutDashboard className="h-4 w-4 mr-2" />Conduct 360
                        </Button>
                      </TableCell>
                      <TableCell><Button size="icon" variant="ghost"><ExternalLink className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
