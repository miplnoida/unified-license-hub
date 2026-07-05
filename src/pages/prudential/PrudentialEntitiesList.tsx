import { usePrudentialEntities } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { useState, useMemo } from 'react';

export default function PrudentialEntitiesList() {
  const { data = [], isLoading } = usePrudentialEntities();
  const [q, setQ] = useState('');
  const rows = useMemo(() => data.filter((e: any) => e.name?.toLowerCase().includes(q.toLowerCase())), [data, q]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Prudentially Supervised Entities</h1>
        <p className="text-sm text-muted-foreground">Universe of supervised entities with current prudential status</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Entities ({rows.length})</CardTitle>
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent>
          {isLoading ? 'Loading…' : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Entity</TableHead>
                <TableHead>License status</TableHead>
                <TableHead>Open actions</TableHead>
                <TableHead>Last return</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell><Badge variant="outline">{e.status || '—'}</Badge></TableCell>
                    <TableCell>{e.open_actions}</TableCell>
                    <TableCell>{e.last_return ? new Date(e.last_return).toLocaleDateString() : '—'}</TableCell>
                    <TableCell className="text-right"><Link className="text-primary underline" to={`/prudential/entities/${e.id}`}>Open</Link></TableCell>
                  </TableRow>
                ))}
                {!rows.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No entities.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
