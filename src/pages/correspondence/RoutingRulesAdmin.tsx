import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { seedRules, CATEGORIES, UNITS, OFFICERS } from './seed';
import type { RoutingRule } from './types';
import { Plus, Trash2 } from 'lucide-react';

export default function RoutingRulesAdmin() {
  const [rules, setRules] = useState<RoutingRule[]>(seedRules);
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => setRules((rs) => rs.map((r) => r.id === id ? { ...r, active: !r.active } : r));
  const remove = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Correspondence Routing Rules"
          description="Configurable business rules for automatic classification and routing. Manual overrides are always available on each case."
          actions={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button data-rbac="settings.create"><Plus className="h-4 w-4 mr-2" />New rule</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New routing rule</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label className="text-xs">Rule name</Label><Input placeholder="e.g. Complaints to Market Conduct" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Match on</Label>
                      <Select defaultValue="category"><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="category">Category</SelectItem>
                          <SelectItem value="institution">Institution</SelectItem>
                          <SelectItem value="subject">Subject contains</SelectItem>
                          <SelectItem value="priority">Priority</SelectItem>
                          <SelectItem value="channel">Channel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Value</Label>
                      <Select defaultValue={CATEGORIES[0]}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Assign to unit</Label>
                      <Select defaultValue={UNITS[0]}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Default officer (optional)</Label>
                      <Select defaultValue={OFFICERS[0]}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{OFFICERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch defaultChecked id="ov" /><Label htmlFor="ov" className="text-xs">Allow manual override on the case</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button data-rbac="settings.edit" onClick={() => setOpen(false)}>Save rule</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Order</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Assign to</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Manual override</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.sort((a, b) => a.order - b.order).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.order}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell><Badge variant="outline">{r.matchType}</Badge> <span className="text-sm">= {r.matchValue}</span></TableCell>
                    <TableCell>
                      <div className="text-sm">{r.assignUnit}</div>
                      {r.assignOfficer && <div className="text-xs text-muted-foreground">{r.assignOfficer}</div>}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{r.priority}</Badge></TableCell>
                    <TableCell>{r.allowManualOverride ? <Badge variant="outline">Allowed</Badge> : <Badge variant="destructive">Locked</Badge>}</TableCell>
                    <TableCell><Switch checked={r.active} onCheckedChange={() => toggle(r.id)} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
