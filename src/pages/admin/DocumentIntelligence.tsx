import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Brain } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

export default function DocumentIntelligence() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [presetFilter, setPresetFilter] = useState('all');
  const [selected, setSelected] = useState<any>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['document_extractions_all'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('document_extractions') as any)
        .select('id, preset, status, extracted, error, model, created_at, file_upload_id, source_type, source_id, file_uploads(file_name, mime_type)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    return rows.filter((r: any) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (presetFilter !== 'all' && r.preset !== presetFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${r.file_uploads?.file_name || ''} ${r.preset} ${r.status} ${r.source_type || ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, presetFilter, search]);

  const counts = useMemo(() => {
    const c = { total: rows.length, completed: 0, processing: 0, failed: 0 };
    rows.forEach((r: any) => {
      if (r.status === 'completed') c.completed++;
      else if (r.status === 'failed') c.failed++;
      else if (r.status === 'processing' || r.status === 'queued') c.processing++;
    });
    return c;
  }, [rows]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" /> Document Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            AI-extracted structured data from uploaded documents (financial statements, IDs, certificates, invoices, returns).
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Total runs</div><div className="text-2xl font-bold">{counts.total}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Completed</div><div className="text-2xl font-bold text-green-600">{counts.completed}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">In progress</div><div className="text-2xl font-bold">{counts.processing}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Failed</div><div className="text-2xl font-bold text-destructive">{counts.failed}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Extractions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-3">
              <Input placeholder="Search file or source…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={presetFilter} onValueChange={setPresetFilter}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All presets</SelectItem>
                  <SelectItem value="generic">Generic</SelectItem>
                  <SelectItem value="financial_statement">Financial statement</SelectItem>
                  <SelectItem value="id_document">ID / KYC</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="compliance_return">Compliance return</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No extractions found.</div>
            ) : (
              <div className="divide-y">
                {filtered.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="w-full text-left py-3 hover:bg-muted/50 rounded px-2 -mx-2 transition"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{r.file_uploads?.file_name || '(unknown file)'}</span>
                      <Badge variant="outline">{r.preset}</Badge>
                      <Badge variant={r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                        {r.status}
                      </Badge>
                      {r.source_type && <Badge variant="outline" className="text-xs">{r.source_type}</Badge>}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {r.error && <div className="text-xs text-destructive mt-1">{r.error}</div>}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected?.file_uploads?.file_name || 'Extraction'}</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline">{selected.preset}</Badge>
                  <Badge>{selected.status}</Badge>
                  {selected.model && <Badge variant="outline">{selected.model}</Badge>}
                </div>
                {selected.error && <div className="text-sm text-destructive">{selected.error}</div>}
                {selected.extracted ? (
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(selected.extracted, null, 2)}
                  </pre>
                ) : (
                  <div className="text-sm text-muted-foreground">No structured payload.</div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
