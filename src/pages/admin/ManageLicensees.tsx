import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/StatCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Building2, CheckCircle, XCircle, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Licensee {
  id: string;
  name: string;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  license_id: string | null;
  status: string;
  created_at: string;
}

interface Sector {
  id: string;
  name: string;
}

export default function ManageLicensees() {
  const [licensees, setLicensees] = useState<Licensee[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', sector_id: '', status: 'active' });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const fetchData = async () => {
    setFetching(true);
    const [{ data: licData }, { data: secData }] = await Promise.all([
      supabase.from('licensees' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('sectors').select('id, name').eq('status', 'active'),
    ]);
    setLicensees((licData as any) || []);
    setSectors(secData || []);
    setFetching(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.name) { toast.error('Licensee name is required'); return; }
    setLoading(true);

    const { error } = await supabase.from('licensees' as any).insert([{
      name: form.name,
      sector_id: form.sector_id || null,
      status: form.status,
    }] as any);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Licensee entity created');
      setDialogOpen(false);
      setForm({ name: '', sector_id: '', status: 'active' });
      fetchData();
    }
    setLoading(false);
  };

  const toggleStatus = async (l: Licensee) => {
    const next = l.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase
      .from('licensees' as any)
      .update({ status: next } as any)
      .eq('id', l.id);
    if (error) { toast.error(error.message); return; }
    setLicensees(prev => prev.map(x => x.id === l.id ? { ...x, status: next } : x));
    toast.success(`Licensee ${next === 'active' ? 'activated' : 'deactivated'}`);
  };

  const columns: Column<Licensee>[] = [
    {
      key: 'name', label: 'Licensee Name', render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">{r.name}</span>
        </div>
      )
    },
    {
      key: 'sector_id', label: 'Sector', render: (r) => {
        const sec = sectors.find(s => s.id === r.sector_id);
        return <span className="text-sm">{sec?.name || '—'}</span>;
      }
    },
    {
      key: 'created_at', label: 'Created', render: (r) => (
        <span className="text-sm">{new Date(r.created_at).toLocaleDateString()}</span>
      )
    },
    {
      key: 'status', label: 'Status', render: (r) => (
        <Badge variant={r.status === 'active' ? 'default' : 'secondary'} className="capitalize">{r.status}</Badge>
      )
    },
    {
      key: 'actions' as any, label: '', render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => toggleStatus(r)}>
          {r.status === 'active' ? <XCircle className="h-4 w-4 mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
          {r.status === 'active' ? 'Deactivate' : 'Activate'}
        </Button>
      )
    },
  ];

  const activeCount = licensees.filter(l => l.status === 'active').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Licensee Entities"
          description="Manage licensee organizations. Create entities after license approval, then assign web users."
          actions={<Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Create Licensee</Button>}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Licensees" value={licensees.length} icon={<Briefcase className="h-6 w-6" />} />
          <StatCard title="Active" value={activeCount} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Inactive" value={licensees.length - activeCount} icon={<XCircle className="h-6 w-6" />} variant="warning" />
        </div>

        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={licensees} searchPlaceholder="Search licensees..." />
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Licensee Entity</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Organization Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. ABC Insurance Corp." />
            </div>
            <div>
              <Label>Sector</Label>
              <Select value={form.sector_id} onValueChange={v => setForm(p => ({ ...p, sector_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent>
                  {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={loading}>{loading ? 'Creating...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
