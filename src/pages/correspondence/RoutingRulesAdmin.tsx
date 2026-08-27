import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, UNITS, OFFICERS } from './seed';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDeleteRoutingRule, useRoutingRules, useSaveRoutingRule, type RoutingRuleRow } from '@/hooks/useCorrespondence';

const emptyRule: Partial<RoutingRuleRow> = {
  name: '', match_type: 'category', match_value: CATEGORIES[0], assign_unit: UNITS[0],
  assign_officer: null, priority: 'normal', sla_days: 5, allow_manual_override: true, sort_order: 10, is_active: true,
};

export default function RoutingRulesAdmin() {
  const { data: rules = [], isLoading } = useRoutingRules();
  const save = useSaveRoutingRule();
  const del = useDeleteRoutingRule();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<RoutingRuleRow>>(emptyRule);

  const toggle = async (r: RoutingRuleRow) => {
    try { await save.mutateAsync({ id: r.id, is_active: !r.is_active }); }
    catch (e: any) { toast.error(e?.message ?? 'Could not update rule'); }
  };

  const remove = async (id: string) => {
    try { await del.mutateAsync(id); toast.success('Rule deleted'); }
    catch (e: any) { toast.error(e?.message ?? 'Could not delete rule'); }
  };

  const submit = async () => {
    if (!draft.name || !draft.match_value || !draft.assign_unit) { toast.error('Name, match value and unit are required.'); return; }
    try {
      await save.mutateAsync(draft);
      toast.success('Rule saved');
      setOpen(false);
      setDraft(emptyRule);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save rule');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Correspondence Routing Rules"
          description="Configurable business rules for automatic classification and routing. Manual overrides are always available on each case."
          actions={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button data-rbac="settings.create"><Plus className="h-4 w-4 mr-2" />New rule</Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>New routing rule</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label className="text-xs">Rule name</Label><Input value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Match on</Label>
                      <Select value={draft.match_type} onValueChange={(v) => setDraft({ ...draft, match_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="category">Category</SelectItem>
                          <SelectItem value="channel">Channel</SelectItem>
                          <SelectItem value="subject">Subject contains</SelectItem>
                          <SelectItem value="priority">Priority</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Value</Label>
                      {draft.match_type === 'category' ? (
                        <Select value={draft.match_value} onValueChange={(v) => setDraft({ ...draft, match_value: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input value={draft.match_value ?? ''} onChange={(e) => setDraft({ ...draft, match_value: e.target.value })} />
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Assign unit</Label>
                      <Select value={draft.assign_unit} onValueChange={(v) => setDraft({ ...draft, assign_unit: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Officer (optional)</Label>
                      <Select value={draft.assign_officer ?? 'none'} onValueChange={(v) => setDraft({ ...draft, assign_officer: v === 'none' ? null : v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No officer</SelectItem>
                          {OFFICERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Priority</Label>
                      <Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">SLA days</Label><Input type="number" value={draft.sla_days ?? 5} onChange={(e) => setDraft({ ...draft, sla_days: Number(e.target.value) })} /></div>
                    <div><Label className="text-xs">Order</Label><Input type="number" value={draft.sort_order ?? 10} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} /></div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button data-rbac="notification_management.dispatch" onClick={submit} disabled={save.isPending}>Save rule</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        <Card>
          <CardContent className="p-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Routes to</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableRow><TableCell colSpan={8}><Skeleton className="h-20 w-full" /></TableCell></TableRow>}
                  {!isLoading && rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.sort_order}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm">{r.match_type}: <span className="text-muted-foreground">{r.match_value}</span></TableCell>
                      <TableCell className="text-sm">{r.assign_unit}{r.assign_officer ? ` → ${r.assign_officer}` : ''}</TableCell>
                      <TableCell><Badge variant="outline">{r.priority}</Badge></TableCell>
                      <TableCell className="text-sm">{r.sla_days} d</TableCell>
                      <TableCell><Switch checked={r.is_active} onCheckedChange={() => toggle(r)} /></TableCell>
                      <TableCell className="text-right">
                        <Button data-rbac="settings.delete" size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && rules.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No routing rules configured yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
