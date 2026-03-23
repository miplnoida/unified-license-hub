import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, Users2 } from 'lucide-react';

export default function WebUsersTab({ entityId }: { entityId: string }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('*').eq('licensee_id', entityId).order('full_name');
      setUsers(data || []);
      setLoading(false);
    })();
  }, [entityId]);

  const filtered = users.filter(u => !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Users2 className="h-5 w-5 text-primary" />Web Portal Users</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search users..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Users2 className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No web users linked to this entity.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Full Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{u.role?.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="capitalize">{u.user_type}</TableCell>
                  <TableCell><Badge variant="outline" className={u.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : ''}>{u.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
