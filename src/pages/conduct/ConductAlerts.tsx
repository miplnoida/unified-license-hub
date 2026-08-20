import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, Bell } from 'lucide-react';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';

const SEV_VARIANT: Record<string, any> = { low: 'outline', medium: 'secondary', high: 'default', critical: 'destructive' };

export default function ConductAlerts() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(true);
  const [overrideAlert, setOverrideAlert] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from('conduct_alerts')
      .select('*, licensees(name), conduct_products(name), conduct_channels(name), conduct_risk_categories(name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows(data || []); setLoading(false);
  };
  useEffect(() => { load(); }, [status]);

  const ack = async (row: any) => {
    try {
      // Governed: acknowledger, timestamp and audit are derived server-side.
      await conductAlertAcknowledge(row.id);
    } catch (e: any) {
      return toast.error(e?.message || 'Could not acknowledge alert');
    }
    load();
  };
  const doClose = async (row: any, extra?: Record<string, any>) => {
    const reason = String(extra?.override_reason || extra?.reason || '').trim()
      || 'Closed after supervisory review of the alert.';
    try {
      // Governed: closure attribution, reason validation and audit are server-side.
      await conductAlertClose(row.id, reason, extra || {});
    } catch (e: any) {
      return toast.error(e?.message || 'Could not close alert');
    }
    load();
  };

  const close = async (row: any) => {
    if (row.triage_rule_id) { setOverrideAlert(row); return; }
    await doClose(row);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Conduct Alerts"
          description="Repeat complaints, vulnerable customers, critical severities, thematic spikes, and SLA breaches."
          actions={
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <Card>
          <CardContent className="p-0">
            {loading ? <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> :
             rows.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground"><Bell className="h-8 w-8 mx-auto mb-2" />No alerts.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Licensee</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{r.kind.replace('_', ' ')}</Badge></TableCell>
                      <TableCell><Badge variant={SEV_VARIANT[r.severity] || 'outline'} className="capitalize">{r.severity}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate font-medium">
                        {r.complaint_id ? <Link to={`/complaints/${r.complaint_id}`} className="text-primary hover:underline">{r.title}</Link> : r.title}
                      </TableCell>
                      <TableCell className="text-sm">{r.licensees?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{r.conduct_products?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{r.conduct_channels?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{r.conduct_risk_categories?.name || '—'}</TableCell>
                      <TableCell><Badge variant={r.status === 'open' ? 'destructive' : r.status === 'acknowledged' ? 'secondary' : 'default'} className="capitalize">{r.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {r.status === 'open' && <Button data-rbac="market_conduct.edit" size="sm" variant="outline" onClick={() => ack(r)}><CheckCircle2 className="h-3 w-3 mr-1" />Ack</Button>}
                        {r.status !== 'closed' && <Button size="sm" variant="ghost" className="ml-1" onClick={() => close(r)}><XCircle className="h-3 w-3 mr-1" />Close</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {overrideAlert && (
        <OverrideReasonDialog
          open
          onOpenChange={(o) => { if (!o) setOverrideAlert(null); }}
          module="complaints"
          entityType="conduct_alert"
          entityId={overrideAlert.id}
          ruleKey="complaints.conduct_alert.close_rule_generated"
          originalValue={{ status: overrideAlert.status, triage_rule_id: overrideAlert.triage_rule_id }}
          overriddenValue={{ status: 'closed' }}
          metadata={{ source: 'ConductAlerts', complaint_id: overrideAlert.complaint_id, kind: overrideAlert.kind }}
          title="Close rule-generated alert"
          description="This alert was raised by an active triage rule. Provide a written justification before closing."
          onOverridden={async () => { await doClose(overrideAlert, { override: true, override_rule_id: overrideAlert.triage_rule_id }); setOverrideAlert(null); }}
        />
      )}
    </DashboardLayout>
  );
}
