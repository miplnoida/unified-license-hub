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
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useReturnEventConfigs, useMutateReturnEventConfig } from '@/hooks/useReturnsManagement';
import { Pencil, Loader2 } from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';

const TOKENS = [
  '{{return_unique_id}}', '{{entity_name}}', '{{return_name}}', '{{return_period}}', '{{return_year}}',
  '{{actor_name}}', '{{actor_email}}', '{{reviewer_name}}', '{{reviewer_email}}',
  '{{submitted_by_name}}', '{{submitted_by_email}}',
  '{{action_comments}}', '{{new_status}}', '{{previous_status}}', '{{edit_reason}}',
  '{{workflow_step_name}}', '{{next_workflow_step_name}}',
];

const CHANNELS = ['in_app', 'email'] as const;
const TYPES = ['info', 'success', 'warning', 'error'];

export default function NotifTemplatesPage() {
  const { data: configs = [], isLoading } = useReturnEventConfigs();
  const { update } = useMutateReturnEventConfig();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [type, setType] = useState('info');
  const [dedupe, setDedupe] = useState(60);
  const [active, setActive] = useState(true);
  const [focus, setFocus] = useState<'body' | 'subject' | 'title' | 'message'>('body');

  const openEdit = (c: any) => {
    setEditing(c);
    setTitle(c.title_template || '');
    setMessage(c.message_template || '');
    setSubject(c.email_subject_template || '');
    setBody(c.email_body_template || '');
    setChannels(c.channels || []);
    setType(c.notification_type || 'info');
    setDedupe(c.dedupe_window_seconds ?? 60);
    setActive(!!c.is_active);
    setOpen(true);
  };

  const handleSave = () => {
    if (!editing) return;
    update.mutate(
      {
        id: editing.id,
        title_template: title,
        message_template: message,
        email_subject_template: subject || null,
        email_body_template: body || null,
        channels,
        notification_type: type,
        dedupe_window_seconds: dedupe,
        is_active: active,
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  const toggleActive = (c: any, val: boolean) =>
    update.mutate({ id: c.id, is_active: val });

  const insertToken = (tok: string) => {
    if (focus === 'subject') setSubject((v) => v + ' ' + tok);
    else if (focus === 'title') setTitle((v) => v + ' ' + tok);
    else if (focus === 'message') setMessage((v) => v + ' ' + tok);
    else setBody((v) => v + ' ' + tok);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Return Notification Templates"
          description="Edit templates and channels for return lifecycle events (sourced from the live notification engine)"
        />
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No return notification events configured
                      </TableCell>
                    </TableRow>
                  ) : (
                    configs.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {c.event_key}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-[320px]">
                          {c.description || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {(c.channels || []).map((ch: string) => (
                              <Badge key={ch} variant="secondary" className="text-xs">
                                {ch}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {c.notification_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={!!c.is_active}
                            onCheckedChange={(v) => toggleActive(c, v)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu
                            actions={[{ label: 'Edit', icon: Pencil, onClick: () => openEdit(c) }]}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit: {editing?.event_key}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>In-App Title</Label>
                <Input
                  value={title}
                  onFocus={() => setFocus('title')}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>In-App Message</Label>
                <Textarea
                  value={message}
                  rows={3}
                  onFocus={() => setFocus('message')}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email Subject</Label>
                <Input
                  value={subject}
                  onFocus={() => setFocus('subject')}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email Body</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {TOKENS.map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 text-xs"
                      onClick={() => insertToken(t)}
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
                <Textarea
                  value={body}
                  rows={8}
                  onFocus={() => setFocus('body')}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Channels</Label>
                  <div className="flex flex-col gap-2">
                    {CHANNELS.map((ch) => (
                      <label key={ch} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={channels.includes(ch)}
                          onCheckedChange={(v) =>
                            setChannels((prev) =>
                              v ? [...prev, ch] : prev.filter((x) => x !== ch),
                            )
                          }
                        />
                        {ch}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Dedupe window (s)</Label>
                  <Input
                    type="number"
                    value={dedupe}
                    onChange={(e) => setDedupe(parseInt(e.target.value || '0', 10))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} />
                <Label>Active</Label>
              </div>
              <Button onClick={handleSave} disabled={update.isPending} className="w-full">
                {update.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
