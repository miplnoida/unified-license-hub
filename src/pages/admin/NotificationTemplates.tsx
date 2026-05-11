import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Bell, Mail, MessageSquare, Smartphone, Copy } from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';

interface NotificationTemplate {
  id: string;
  name: string;
  event_type: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: any[];
  is_active: boolean;
  regulator_id: string | null;
  created_at: string;
}

const EVENT_TYPES = [
  { value: 'application_submitted', label: 'Application Submitted' },
  { value: 'application_approved', label: 'Application Approved' },
  { value: 'application_rejected', label: 'Application Rejected' },
  { value: 'application_query', label: 'Query Raised on Application' },
  { value: 'license_issued', label: 'License Issued' },
  { value: 'license_expiring', label: 'License Expiring Soon' },
  { value: 'license_expired', label: 'License Expired' },
  { value: 'return_due', label: 'Return Due Reminder' },
  { value: 'return_overdue', label: 'Return Overdue' },
  { value: 'return_submitted', label: 'Return Submitted' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'penalty_applied', label: 'Penalty Applied' },
  { value: 'user_registered', label: 'User Registered' },
  { value: 'password_reset', label: 'Password Reset' },
  { value: 'complaint_filed', label: 'Complaint Filed' },
  { value: 'complaint_resolved', label: 'Complaint Resolved' },
];

const CHANNELS = [
  { value: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { value: 'sms', label: 'SMS', icon: <Smartphone className="h-4 w-4" /> },
  { value: 'in_app', label: 'In-App', icon: <Bell className="h-4 w-4" /> },
];

const MERGE_FIELDS = [
  '{{user_name}}', '{{user_email}}', '{{application_number}}', '{{license_number}}',
  '{{return_name}}', '{{due_date}}', '{{amount}}', '{{status}}', '{{regulator_name}}',
  '{{entity_name}}', '{{complaint_number}}', '{{period}}',
];

export default function NotificationTemplates() {
  useAuth();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  // Form state
  const [name, setName] = useState('');
  const [eventType, setEventType] = useState('');
  const [channel, setChannel] = useState('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isActive, setIsActive] = useState(true);

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('notification_event_configs')
      .select('*')
      .order('event_key', { ascending: true });
    if (!error) {
      const rows = (data || []).flatMap((row: any) => {
        const channels = Array.isArray(row.channels) && row.channels.length ? row.channels : ['in_app'];
        return channels.map((channel: string) => ({
          id: `${row.id}:${channel}`,
          source_id: row.id,
          name: row.description || row.event_key,
          event_type: row.event_key,
          channel,
          subject: channel === 'email' ? row.email_subject_template : row.title_template,
          body: channel === 'email' ? (row.email_body_template || row.message_template) : row.message_template,
          variables: [],
          is_active: !!row.is_active,
          regulator_id: null,
          created_at: row.created_at,
        }));
      });
      setTemplates(rows as any);
    }
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const resetForm = () => {
    setName(''); setEventType(''); setChannel('email'); setSubject(''); setBody('');
    setIsActive(true); setEditing(null);
  };

  const openEdit = (t: NotificationTemplate) => {
    setEditing(t);
    setName(t.name); setEventType(t.event_type); setChannel(t.channel);
    setSubject(t.subject || ''); setBody(t.body); setIsActive(t.is_active);
    setDialogOpen(true);
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };

  const handleSave = async () => {
    if (!name.trim() || !eventType || !body.trim()) {
      toast.error('Name, event type, and body are required');
      return;
    }
    setSaving(true);
    const sourceId = (editing as any)?.source_id;
    const existing = templates.filter(t => t.event_type === eventType);
    const nextChannels = Array.from(new Set([
      ...existing.filter(t => !sourceId || (t as any).source_id === sourceId).map(t => t.channel),
      channel,
    ]));
    const payload: any = {
      description: name.trim(),
      event_key: eventType,
      title_template: channel === 'email' ? (editing?.subject || name.trim()) : name.trim(),
      message_template: channel === 'email' ? body.trim() : body.trim(),
      email_subject_template: channel === 'email' ? subject.trim() || null : editing?.subject || null,
      email_body_template: channel === 'email' ? body.trim() : body.trim(),
      channels: nextChannels,
      is_active: isActive,
    };

    if (editing && sourceId) {
      const { error } = await supabase.from('notification_event_configs').update(payload).eq('id', sourceId);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Template updated');
    } else {
      const { error } = await supabase.from('notification_event_configs').insert({
        ...payload,
        recipient_rules: [],
        notification_type: 'info',
      });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Template created');
    }
    setSaving(false); setDialogOpen(false); resetForm(); loadTemplates();
  };

  const handleDelete = async (id: string) => {
    const sourceId = (templates.find(t => t.id === id) as any)?.source_id;
    const { error } = await supabase.from('notification_event_configs').delete().eq('id', sourceId);
    if (error) { toast.error(error.message); return; }
    toast.success('Template deleted'); loadTemplates();
  };

  const handleDuplicate = async (t: NotificationTemplate) => {
    const { error } = await supabase.from('notification_event_configs').insert({
      event_key: `${t.event_type}.copy.${Date.now()}`,
      description: `${t.name} (Copy)`,
      title_template: t.channel === 'email' ? (t.subject || t.name) : t.name,
      message_template: t.body,
      email_subject_template: t.channel === 'email' ? t.subject : null,
      email_body_template: t.channel === 'email' ? t.body : null,
      channels: [t.channel],
      recipient_rules: [],
      notification_type: 'info',
      is_active: false,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Template duplicated'); loadTemplates();
  };

  const filtered = activeTab === 'all' ? templates : templates.filter(t => t.channel === activeTab);

  const channelIcon = (ch: string) => {
    if (ch === 'email') return <Mail className="h-4 w-4" />;
    if (ch === 'sms') return <Smartphone className="h-4 w-4" />;
    return <Bell className="h-4 w-4" />;
  };

  const eventLabel = (et: string) => EVENT_TYPES.find(e => e.value === et)?.label || et;

  const columns: Column<NotificationTemplate>[] = [
    {
      key: 'name', label: 'Template', render: (r) => (
        <div>
          <p className="font-medium text-foreground">{r.name}</p>
          <p className="text-xs text-muted-foreground">{eventLabel(r.event_type)}</p>
        </div>
      )
    },
    {
      key: 'channel', label: 'Channel', render: (r) => (
        <div className="flex items-center gap-2">
          {channelIcon(r.channel)}
          <span className="capitalize text-sm">{r.channel.replace('_', '-')}</span>
        </div>
      )
    },
    {
      key: 'subject', label: 'Subject', render: (r) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {r.subject || '—'}
        </span>
      )
    },
    {
      key: 'is_active', label: 'Status', render: (r) => (
        <Badge variant={r.is_active ? 'default' : 'secondary'}>
          {r.is_active ? 'Active' : 'Inactive'}
        </Badge>
      )
    },
    {
      key: 'actions' as any, label: '', render: (r) => (
        <RowActionsMenu actions={[
          { label: 'Edit', icon: Edit, onClick: () => openEdit(r) },
          { label: 'Duplicate', icon: Copy, onClick: () => handleDuplicate(r) },
          { label: 'Delete', icon: Trash2, onClick: () => handleDelete(r.id), destructive: true, separator: true },
        ]} />
      )
    },
  ];

  const stats = [
    { label: 'Total Templates', val: templates.length, icon: <Bell className="h-5 w-5" /> },
    { label: 'Email', val: templates.filter(t => t.channel === 'email').length, icon: <Mail className="h-5 w-5" /> },
    { label: 'SMS', val: templates.filter(t => t.channel === 'sms').length, icon: <Smartphone className="h-5 w-5" /> },
    { label: 'In-App', val: templates.filter(t => t.channel === 'in_app').length, icon: <Bell className="h-5 w-5" /> },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Notification Templates"
          description="Manage email, SMS, and in-app notification templates for all system events."
          actions={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />New Template</Button>}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          {stats.map(s => (
            <Card key={s.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">{s.icon}</div>
                  <div>
                    <p className="text-2xl font-bold">{loading ? '...' : s.val}</p>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="sms">SMS</TabsTrigger>
            <TabsTrigger value="in_app">In-App</TabsTrigger>
          </TabsList>
          <TabsContent value={activeTab}>
            <DataTableShell columns={columns} data={filtered} searchPlaceholder="Search templates..." />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Create'} Notification Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Application Approved Email" />
              </div>
              <div className="space-y-2">
                <Label>Channel *</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">{c.icon}{c.label}</div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Event Type *</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue placeholder="Select event..." /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(e => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {channel === 'email' && (
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Your application {{application_number}} has been approved" />
              </div>
            )}

            <div className="space-y-2">
              <Label>Body *</Label>
              <Textarea
                value={body} onChange={e => setBody(e.target.value)}
                placeholder="Dear {{user_name}},&#10;&#10;Your application {{application_number}} has been approved..."
                className="min-h-[160px] font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Available Merge Fields (click to copy)</Label>
              <div className="flex flex-wrap gap-1.5">
                {MERGE_FIELDS.map(f => (
                  <Badge
                    key={f} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs"
                    onClick={() => { navigator.clipboard.writeText(f); toast.success(`Copied ${f}`); }}
                  >
                    {f}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Enable this template for sending</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
