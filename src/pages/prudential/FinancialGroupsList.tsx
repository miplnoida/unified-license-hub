import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { bandTone } from '@/lib/groupConsolidation';
import { useCan } from '@/hooks/useCan';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useFinancialGroups } from '@/hooks/useFinancialGroups';
import { CreateFinancialGroupWizard } from '@/components/prudential/CreateFinancialGroupWizard';

/** PRU-GRP-001 — register of supervised financial groups. */
export default function FinancialGroupsList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const { data: groups = [], isLoading } = useFinancialGroups();
  const canManage = useCan('prudential_supervision', 'edit');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) =>
      g.name.toLowerCase().includes(q) || g.group_code.toLowerCase().includes(q));
  }, [groups, search]);

  return (
    <DashboardLayout>
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financial Groups</h1>
          <p className="text-sm text-muted-foreground">
            Consolidated risk profiles for parent/subsidiary structures under supervision.
          </p>
        </div>
        {canManage && (
          <Button data-rbac="prudential_supervision.create" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />New group
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Group register</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search groups…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading groups…</p>
          ) : !filtered.length ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No financial groups recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Holding entity</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead>Latest period</TableHead>
                    <TableHead className="text-right">Group score</TableHead>
                    <TableHead>Band</TableHead>
                    <TableHead className="text-right">Open alerts</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((g) => (
                    <TableRow key={g.id} className="cursor-pointer" onClick={() => navigate(`/prudential/groups/${g.id}`)}>
                      <TableCell className="font-mono text-xs">{g.group_code}</TableCell>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{g.holding_entity_name ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{g.member_count}</TableCell>
                      <TableCell className="font-mono text-xs">{g.last_period ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{g.score ?? '—'}</TableCell>
                      <TableCell>
                        {g.band
                          ? <Badge variant="outline" className={cn('text-[11px]', bandTone(g.band))}>{g.band}</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {g.open_alerts ? (
                          <span className="inline-flex items-center gap-1 font-mono text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3" />{g.open_alerts}
                          </span>
                        ) : <span className="font-mono text-xs text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[11px]">{g.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <CreateFinancialGroupWizard
        open={open}
        onOpenChange={setOpen}
        onCreated={(id) => navigate(`/prudential/groups/${id}`)}
      />
    </div>
    </DashboardLayout>
  );
}
