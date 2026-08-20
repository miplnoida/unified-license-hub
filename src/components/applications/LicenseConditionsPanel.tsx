import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, ClipboardList, Trash2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  licenseId: string;
  applicationId?: string | null;
  isInternal: boolean;
}

interface Condition {
  id: string;
  category: string;
  description: string;
  due_date: string | null;
  monitoring_owner: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  satisfied_at: string | null;
}

const CATEGORIES = ['Financial', 'Operational', 'Governance', 'Reporting', 'Compliance', 'Other'];
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-warning/15 text-warning',
  in_progress: 'bg-primary/15 text-primary',
  satisfied: 'bg-success/15 text-success',
  waived: 'bg-muted text-muted-foreground',
  overdue: 'bg-destructive/15 text-destructive',
};

export function LicenseConditionsPanel({ licenseId, applicationId, isInternal }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<Condition[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: 'Compliance',
    description: '',
    due_date: '',
    monitoring_owner: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('license_conditions' as any)
      .select('id, category, description, due_date, monitoring_owner, status, notes, created_at, satisfied_at')
      .eq('license_id', licenseId)
      .order('created_at', { ascending: false });
    setItems((data as any) || []);
    setLoading(false);
  }, [licenseId]);

  useEffect(() => { load(); }, [load]);

  const addCondition = async () => {
    if (!form.description.trim() || form.description.trim().length < 5) {
      toast.error('Description must be at least 5 characters');
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc('license_condition_create', {
      _license_id: licenseId,
      _category: form.category,
      _description: form.description.trim(),
      _application_id: applicationId || null,
      _due_date: form.due_date || null,
      _monitoring_owner: form.monitoring_owner.trim() || null,
      _notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Condition added');
    setOpen(false);
    setForm({ category: 'Compliance', description: '', due_date: '', monitoring_owner: '', notes: '' });
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).rpc('license_condition_set_status', {
      _condition_id: id,
      _status: status,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Updated');
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this condition?')) return;
    const { error } = await (supabase as any).rpc('license_condition_delete', { _condition_id: id });
    if (error) { toast.error(error.message); return; }
    load();
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          License Conditions
          <Badge variant="secondary" className="ml-1">{items.length}</Badge>
        </CardTitle>
        {isInternal && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-rbac="application_management.edit" size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Add condition</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add License Condition</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description *</Label>
                  <Textarea rows={3} value={form.description}
                    onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Submit audited financials within 90 days of year end" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Due date</Label>
                    <Input type="date" value={form.due_date}
                      onChange={(e) => setForm(f => ({ ...f, due_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Monitoring owner</Label>
                    <Input value={form.monitoring_owner}
                      onChange={(e) => setForm(f => ({ ...f, monitoring_owner: e.target.value }))}
                      placeholder="e.g. Supervision Division" />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea rows={2} value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button data-rbac="application_management.edit" onClick={addCondition} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No conditions attached to this license.</p>
        ) : (
          <div className="space-y-2">
            {items.map(c => (
              <div key={c.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{c.category}</Badge>
                      <Badge className={`text-xs ${STATUS_COLORS[c.status] || ''}`}>{c.status.replace('_', ' ')}</Badge>
                      {c.due_date && (
                        <span className="text-xs text-muted-foreground">
                          Due {new Date(c.due_date).toLocaleDateString()}
                        </span>
                      )}
                      {c.monitoring_owner && (
                        <span className="text-xs text-muted-foreground">· {c.monitoring_owner}</span>
                      )}
                    </div>
                    <p className="text-sm mt-1">{c.description}</p>
                    {c.notes && <p className="text-xs text-muted-foreground mt-1">{c.notes}</p>}
                  </div>
                  {isInternal && (
                    <div className="flex items-center gap-1">
                      {c.status !== 'satisfied' && (
                        <Button size="sm" variant="ghost" onClick={() => updateStatus(c.id, 'satisfied')} title="Mark satisfied">
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LicenseConditionsPanel;
