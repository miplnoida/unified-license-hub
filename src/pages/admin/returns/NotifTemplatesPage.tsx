import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useReturnNotificationTemplates, useMutateReturnNotifTemplate } from '@/hooks/useReturnsManagement';
import { PlusCircle, Pencil, Trash2, Loader2 } from 'lucide-react';

const TOKENS = ['{{entity_name}}', '{{return_name}}', '{{period}}', '{{year}}', '{{due_date}}', '{{unique_id}}', '{{reviewer_name}}', '{{comments}}', '{{portal_link}}'];

export default function NotifTemplatesPage() {
  const { data: templates = [], isLoading } = useReturnNotificationTemplates();
  const { create, update, remove } = useMutateReturnNotifTemplate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState(true);

  const reset = () => { setCode(''); setName(''); setSubject(''); setBody(''); setStatus(true); setEditing(null); };
  const openEdit = (t: any) => { setEditing(t); setCode(t.template_code); setName(t.name); setSubject(t.subject_template || ''); setBody(t.body_template); setStatus(t.status === 'active'); setOpen(true); };

  const handleSave = () => {
    if (!code.trim() || !name.trim() || !body.trim()) return;
    const payload = { template_code: code.trim(), name: name.trim(), subject_template: subject.trim() || null, body_template: body.trim(), status: status ? 'active' : 'inactive' };
    if (editing) {
      update.mutate({ id: editing.id, ...payload }, { onSuccess: () => { setOpen(false); reset(); } });
    } else {
      create.mutate(payload, { onSuccess: () => { setOpen(false); reset(); } });
    }
  };

  const insertToken = (token: string) => setBody(prev => prev + ' ' + token);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Return Notification Templates" description="Manage email templates for return lifecycle events"
          actions={
            <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
              <DialogTrigger asChild><Button><PlusCircle className="h-4 w-4 mr-2" />Add Template</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Notification Template</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Template Code *</Label><Input value={code} onChange={e => setCode(e.target.value)} placeholder="return_due_reminder" /></div>
                    <div className="space-y-2"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Return Due Reminder" /></div>
                  </div>
                  <div className="space-y-2"><Label>Subject</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Reminder: {{return_name}} due" /></div>
                  <div className="space-y-2">
                    <Label>Body *</Label>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {TOKENS.map(t => <Badge key={t} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => insertToken(t)}>{t}</Badge>)}
                    </div>
                    <Textarea value={body} onChange={e => setBody(e.target.value)} rows={8} />
                  </div>
                  <div className="flex items-center gap-2"><Switch checked={status} onCheckedChange={setStatus} /><Label>Active</Label></div>
                  <Button onClick={handleSave} disabled={create.isPending || update.isPending} className="w-full">
                    {(create.isPending || update.isPending) ? 'Saving...' : editing ? 'Update' : 'Create'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          }
        />
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {templates.map(t => (
                    <TableRow key={t.id}>
                      <TableCell><Badge variant="outline">{t.template_code}</Badge></TableCell>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{t.subject_template || '—'}</TableCell>
                      <TableCell><Badge variant={t.status === 'active' ? 'default' : 'secondary'}>{t.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
