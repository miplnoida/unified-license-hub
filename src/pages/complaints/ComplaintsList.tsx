import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { INTERNAL_ROLES } from '@/types/platform';
import { PlusCircle, Search, Eye, AlertTriangle, Loader2, UserCheck } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  submitted: 'default',
  under_investigation: 'outline',
  resolved: 'default',
  closed: 'secondary',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  under_investigation: 'Under Investigation',
  resolved: 'Resolved',
  closed: 'Closed',
};

interface Complaint {
  id: string;
  complaint_number: string;
  complainant_id: string;
  subject: string;
  description: string;
  status: string;
  investigator_id: string | null;
  resolution: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

interface ComplainantProfile {
  full_name: string;
  email: string;
  user_type: string;
}

export default function ComplaintsList() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<Complaint | null>(null);
  const [detailProfile, setDetailProfile] = useState<ComplainantProfile | null>(null);
  const [newSubject, setNewSubject] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [resolution, setResolution] = useState('');
  const [updating, setUpdating] = useState(false);

  const isInternal = user && INTERNAL_ROLES.includes(user.role);

  const loadComplaints = async () => {
    setLoading(true);
    const { data } = await supabase.from('complaints').select('*').order('created_at', { ascending: false });
    setComplaints((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { loadComplaints(); }, []);

  const handleCreate = async () => {
    if (!newSubject.trim() || !newDesc.trim() || !user) {
      toast.error('Please fill all fields');
      return;
    }
    setCreating(true);
    const { error } = await supabase.from('complaints').insert({
      complainant_id: user.id,
      subject: newSubject.trim(),
      description: newDesc.trim(),
      email: user.email,
    } as any);
    if (error) { toast.error(error.message); setCreating(false); return; }

    await logAudit({ action: 'complaint_created', entityType: 'complaint' });
    toast.success('Complaint submitted');
    setNewDialogOpen(false);
    setNewSubject('');
    setNewDesc('');
    setCreating(false);
    loadComplaints();
  };

  const handleUpdateStatus = async (complaint: Complaint, newStatus: string) => {
    setUpdating(true);
    const updates: any = { status: newStatus };
    if (newStatus === 'under_investigation') updates.investigator_id = user?.id;
    if (newStatus === 'resolved' && resolution) updates.resolution = resolution;

    const { error } = await supabase.from('complaints').update(updates).eq('id', complaint.id);
    if (error) { toast.error(error.message); setUpdating(false); return; }

    await logAudit({
      action: `complaint_${newStatus}`,
      entityType: 'complaint',
      entityId: complaint.id,
      newValue: { status: newStatus },
    });
    toast.success(`Complaint ${STATUS_LABELS[newStatus]?.toLowerCase() || newStatus}`);
    setUpdating(false);
    setDetailDialog(null);
    setResolution('');
    loadComplaints();
  };

  const filtered = complaints.filter(c => {
    if (search && !c.complaint_number.toLowerCase().includes(search.toLowerCase()) &&
        !c.subject.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Complaints"
          description={isInternal ? 'Manage and investigate complaints' : 'Submit and track your complaints'}
          actions={
            !isInternal && (
              <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
                <DialogTrigger asChild>
                  <Button><PlusCircle className="h-4 w-4 mr-2" />File Complaint</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Submit a Complaint</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Subject</Label><Input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Brief subject..." /></div>
                    <div><Label>Description</Label><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Describe the complaint in detail..." rows={5} /></div>
                    <Button onClick={handleCreate} disabled={creating} className="w-full">{creating ? 'Submitting...' : 'Submit Complaint'}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )
          }
        />

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search complaints..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Complaint #</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No complaints found</TableCell></TableRow>
                  ) : filtered.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm font-medium">{c.complaint_number}</TableCell>
                      <TableCell className="max-w-xs truncate">{c.subject}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[c.status] || 'outline'} className="capitalize">
                          {STATUS_LABELS[c.status] || c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDetailDialog(c)}>
                          <Eye className="h-4 w-4 mr-1" />View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailDialog} onOpenChange={open => { if (!open) setDetailDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Complaint {detailDialog?.complaint_number}</DialogTitle></DialogHeader>
          {detailDialog && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Subject</p>
                <p className="font-medium">{detailDialog.subject}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-sm">{detailDialog.description}</p>
              </div>
              <div className="flex gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={statusVariant[detailDialog.status]} className="capitalize">{STATUS_LABELS[detailDialog.status]}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Filed</p>
                  <p className="text-sm">{new Date(detailDialog.created_at).toLocaleString()}</p>
                </div>
              </div>
              {detailDialog.resolution && (
                <div>
                  <p className="text-sm text-muted-foreground">Resolution</p>
                  <p className="text-sm">{detailDialog.resolution}</p>
                </div>
              )}

              {isInternal && detailDialog.status !== 'closed' && (
                <>
                  {detailDialog.status === 'submitted' && (
                    <Button onClick={() => handleUpdateStatus(detailDialog, 'under_investigation')} disabled={updating} className="w-full">
                      <UserCheck className="h-4 w-4 mr-2" />Take Investigation
                    </Button>
                  )}
                  {detailDialog.status === 'under_investigation' && (
                    <div className="space-y-3">
                      <div><Label>Resolution</Label><Textarea value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Describe the resolution..." rows={3} /></div>
                      <div className="flex gap-2">
                        <Button onClick={() => handleUpdateStatus(detailDialog, 'resolved')} disabled={updating} className="flex-1">Mark Resolved</Button>
                        <Button onClick={() => handleUpdateStatus(detailDialog, 'closed')} disabled={updating} variant="outline" className="flex-1">Close</Button>
                      </div>
                    </div>
                  )}
                  {detailDialog.status === 'resolved' && (
                    <Button onClick={() => handleUpdateStatus(detailDialog, 'closed')} disabled={updating} variant="outline" className="w-full">Close Complaint</Button>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
