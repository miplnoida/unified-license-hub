import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Download, Play } from 'lucide-react';
import { toast } from 'sonner';

type Job = {
  id: string;
  source: string;
  from_date: string | null;
  to_date: string | null;
  module_filter: string | null;
  status: string;
  row_count: number | null;
  file_path: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export default function AuditExport() {
  const qc = useQueryClient();
  const [source, setSource] = useState('audit_logs');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['audit_export_jobs'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('audit_export_jobs') as any)
        .select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data as Job[];
    },
    refetchInterval: 5000,
  });

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('audit-export', {
        body: {
          action: 'run',
          source,
          from_date: fromDate ? new Date(fromDate).toISOString() : null,
          to_date: toDate ? new Date(toDate + 'T23:59:59').toISOString() : null,
          module_filter: moduleFilter.trim() || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Exported ${data.row_count} rows`);
      qc.invalidateQueries({ queryKey: ['audit_export_jobs'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const download = async (filePath: string) => {
    const { data, error } = await supabase.functions.invoke('audit-export', {
      body: { action: 'download_url', file_path: filePath },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? 'Failed');
      return;
    }
    window.open((data as any).url, '_blank');
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Audit Log Export"
        description="Package activity/audit logs into a CSV for regulators and external auditors."
      />

      <Card>
        <CardHeader><CardTitle>New export</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <Label>Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="audit_logs">Activity logs</SelectItem>
                <SelectItem value="compliance_audit_logs">Compliance audit logs</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>From</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div>
            <Label>Module / table (optional)</Label>
            <Input value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} placeholder="e.g. applications" />
          </div>
          <div className="flex items-end">
            <Button onClick={() => run.mutate()} disabled={run.isPending} className="w-full">
              {run.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Run export
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Recent exports</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(j => (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs">{new Date(j.created_at).toLocaleString()}</TableCell>
                    <TableCell>{j.source}</TableCell>
                    <TableCell className="text-xs">
                      {j.from_date ? new Date(j.from_date).toLocaleDateString() : '—'} →{' '}
                      {j.to_date ? new Date(j.to_date).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>{j.row_count ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={j.status === 'completed' ? 'default' : j.status === 'failed' ? 'destructive' : 'secondary'}>
                        {j.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {j.file_path && j.status === 'completed' && (
                        <Button size="sm" variant="outline" onClick={() => download(j.file_path!)}>
                          <Download className="h-3 w-3 mr-1" />CSV
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {jobs.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No exports yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
