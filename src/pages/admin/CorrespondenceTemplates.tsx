import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { authorizedAction } from '@/lib/rbac/authorizedAction';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type Template = {
  id: string;
  code: string;
  name: string;
  category: string;
  channel: string;
  subject: string | null;
  body: string;
  is_active: boolean;
  updated_at: string;
};

const CATEGORIES = ['general', 'notice', 'decision', 'rfi', 'penalty', 'reminder', 'closure'];
const CHANNELS = ['email', 'sms', 'letter'];

const EMPTY: Partial<Template> = {
  code: '',
  name: '',
  category: 'general',
  channel: 'email',
  subject: '',
  body: '',
  is_active: true,
};

export default function CorrespondenceTemplates() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [open, setOpen] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['correspondence_templates'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('correspondence_templates') as any)
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Template[];
    },
  });

  const save = useMutation({
    mutationFn: async (t: Partial<Template>) => {
      if (!t.code || !t.name || !t.body) throw new Error('Code, name and body are required');
      await authorizedAction('settings', t.id ? 'edit' : 'create', { template_code: t.code });
      const payload = {
        code: t.code,
        name: t.name,
        category: t.category || 'general',
        channel: t.channel || 'email',
        subject: t.subject || null,
        body: t.body,
        is_active: t.is_active ?? true,
      };
      if (t.id) {
        const { error } = await (supabase.from('correspondence_templates') as any)
          .update(payload)
          .eq('id', t.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('correspondence_templates') as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Template saved');
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['correspondence_templates'] });
    },
    onError: (e: any) => toast.error(e.message || 'Save failed'),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('correspondence_templates') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Deleted');
      qc.invalidateQueries({ queryKey: ['correspondence_templates'] });
    },
    onError: (e: any) => toast.error(e.message || 'Delete failed'),
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Correspondence Templates</h1>
            <p className="text-sm text-muted-foreground">
              Reusable letter, email and SMS templates. Tokens like{' '}
              <code className="text-xs bg-muted px-1 rounded">{'{{application_number}}'}</code>,{' '}
              <code className="text-xs bg-muted px-1 rounded">{'{{recipient_name}}'}</code>, and any
              column on the source record are auto-filled.
            </p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button data-rbac="settings.edit" onClick={() => setEditing({ ...EMPTY })}>
                <Plus className="h-4 w-4 mr-1" /> New template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing?.id ? 'Edit template' : 'New template'}</DialogTitle>
              </DialogHeader>
              {editing && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Code</Label>
                      <Input
                        value={editing.code || ''}
                        onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                        placeholder="RFI_INITIAL"
                      />
                    </div>
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={editing.name || ''}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Category</Label>
                      <Select
                        value={editing.category || 'general'}
                        onValueChange={(v) => setEditing({ ...editing, category: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Channel</Label>
                      <Select
                        value={editing.channel || 'email'}
                        onValueChange={(v) => setEditing({ ...editing, channel: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Subject</Label>
                    <Input
                      value={editing.subject || ''}
                      onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                      placeholder="Regarding your application {{application_number}}"
                    />
                  </div>
                  <div>
                    <Label>Body</Label>
                    <Textarea
                      rows={10}
                      value={editing.body || ''}
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                      placeholder={"Dear {{recipient_name}},\n\n..."}
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
                <Button data-rbac="settings.edit" onClick={() => editing && save.mutate(editing)} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Templates ({templates.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : templates.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                No templates yet. Create one to standardise correspondence.
              </div>
            ) : (
              <div className="divide-y">
                {templates.map((t) => (
                  <div key={t.id} className="py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{t.name}</span>
                        <Badge variant="outline">{t.code}</Badge>
                        <Badge variant="secondary">{t.category}</Badge>
                        <Badge>{t.channel}</Badge>
                        {!t.is_active && <Badge variant="destructive">inactive</Badge>}
                      </div>
                      {t.subject && (
                        <div className="text-xs text-muted-foreground mt-1 truncate">{t.subject}</div>
                      )}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => confirm('Delete this template?') && del.mutate(t.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
