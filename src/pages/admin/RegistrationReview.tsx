import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { invokePerformRegistrationWorkflowAction } from '@/lib/registrationWorkflowClient';

interface PendingRegistration {
  id: string;
  applicant_name: string;
  email: string;
  status: string;
  registration_reference: string;
  created_at: string;
  sector_id: string | null;
}

interface ActiveAction {
  registration: PendingRegistration;
  action: 'approve' | 'reject' | 'send_back' | 'request_resubmission';
}

const ACTION_LABEL: Record<ActiveAction['action'], string> = {
  approve: 'Approve',
  reject: 'Reject',
  send_back: 'Send Back',
  request_resubmission: 'Request Resubmission',
};

export default function RegistrationReview() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PendingRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveAction | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('registrations')
      .select('id, applicant_name, email, status, registration_reference, created_at, sector_id')
      .in('status', ['pending_review', 'in_progress', 'resubmission_required'])
      .order('created_at', { ascending: false });
    setRows((data || []) as any);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submitAction() {
    if (!active) return;
    setSubmitting(true);
    try {
      const res = await invokePerformRegistrationWorkflowAction({
        registration_id: active.registration.id,
        action_type: active.action,
        comments,
      });
      if (!res.ok) {
        toast({ title: 'Action failed', description: res.error || 'Unknown error', variant: 'destructive' });
      } else {
        toast({ title: 'Done', description: `Registration ${ACTION_LABEL[active.action].toLowerCase()}d.` });
        setActive(null);
        setComments('');
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Registration Review"
          description="Review and act on pending licensee registrations via the shared approval workflow."
        />

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">No registrations awaiting review.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm">{r.registration_reference}</TableCell>
                        <TableCell className="font-medium">{r.applicant_name}</TableCell>
                        <TableCell className="text-sm">{r.email}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{r.status.replace(/_/g, ' ')}</Badge></TableCell>
                        <TableCell className="text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="default" onClick={() => { setActive({ registration: r, action: 'approve' }); setComments(''); }}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => { setActive({ registration: r, action: 'send_back' }); setComments(''); }}>Send Back</Button>
                          <Button size="sm" variant="outline" onClick={() => { setActive({ registration: r, action: 'request_resubmission' }); setComments(''); }}>Request Resubmission</Button>
                          <Button size="sm" variant="destructive" onClick={() => { setActive({ registration: r, action: 'reject' }); setComments(''); }}>Reject</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!active} onOpenChange={open => { if (!open) { setActive(null); setComments(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active ? ACTION_LABEL[active.action] : ''} Registration</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-3">
              <div className="text-sm">
                <div><span className="text-muted-foreground">Applicant:</span> {active.registration.applicant_name}</div>
                <div><span className="text-muted-foreground">Reference:</span> <span className="font-mono">{active.registration.registration_reference}</span></div>
              </div>
              <Textarea
                value={comments}
                onChange={e => setComments(e.target.value)}
                placeholder="Remarks (required for approve/reject/request_resubmission)"
                rows={4}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActive(null); setComments(''); }}>Cancel</Button>
            <Button onClick={submitAction} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm {active ? ACTION_LABEL[active.action] : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
