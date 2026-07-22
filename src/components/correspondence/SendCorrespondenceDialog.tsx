import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Send, Mail } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type SourceType =
  | 'application'
  | 'enforcement'
  | 'complaint'
  | 'fp_assessment'
  | 'return'
  | 'licensee';

interface Props {
  sourceType: SourceType;
  sourceId: string;
  defaultRecipientUserId?: string | null;
  defaultRecipientEmail?: string | null;
  defaultRecipientName?: string | null;
  trigger?: React.ReactNode;
}

export function SendCorrespondenceDialog({
  sourceType,
  sourceId,
  defaultRecipientUserId,
  defaultRecipientEmail,
  defaultRecipientName,
  trigger,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>('__none__');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms' | 'letter'>('email');
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail || '');
  const [recipientName, setRecipientName] = useState(defaultRecipientName || '');

  const { data: templates = [] } = useQuery({
    queryKey: ['correspondence_templates', 'active'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase.from('correspondence_templates') as any)
        .select('id, name, code, category, channel, subject, body')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    if (templateId === '__none__') return;
    const t = templates.find((x: any) => x.id === templateId);
    if (t) {
      setSubject(t.subject || '');
      setBody(t.body || '');
      setChannel((t.channel as any) || 'email');
    }
  }, [templateId, templates]);

  const send = useMutation({
    mutationFn: async () => {
      if (!body.trim()) throw new Error('Body is required');
      const { authorizedAction } = await import('@/lib/rbac/authorizedAction');
      await authorizedAction('correspondence_management', 'approve', { source_type: sourceType, source_id: sourceId, channel });
      const { data, error } = await supabase.functions.invoke('send-correspondence', {

        body: {
          template_id: templateId === '__none__' ? undefined : templateId,
          subject,
          body,
          channel,
          source_type: sourceType,
          source_id: sourceId,
          recipient_user_id: defaultRecipientUserId || undefined,
          recipient_email: recipientEmail || undefined,
          recipient_name: recipientName || undefined,
        },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || 'send failed');
      return data;
    },
    onSuccess: () => {
      toast.success('Correspondence sent');
      setOpen(false);
      setTemplateId('__none__');
      setSubject('');
      setBody('');
      qc.invalidateQueries({ queryKey: ['correspondence_dispatches', sourceType, sourceId] });
    },
    onError: (e: any) => toast.error(e.message || 'Send failed'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button data-rbac="correspondence_management.approve" variant="outline" size="sm">
            <Mail className="h-4 w-4 mr-1" /> Send correspondence
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send correspondence</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a template (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None / custom —</SelectItem>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="letter">Letter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Recipient email</Label>
              <Input
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="recipient@example.com"
              />
            </div>
          </div>
          <div>
            <Label>Recipient name</Label>
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Body</Label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              Tokens like <code>{'{{recipient_name}}'}</code>, <code>{'{{application_number}}'}</code>,{' '}
              and any field on the source record will be replaced automatically.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button data-rbac="correspondence_management.approve" onClick={() => send.mutate()} disabled={send.isPending}>
            {send.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CorrespondenceHistory({ sourceType, sourceId }: { sourceType: SourceType; sourceId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['correspondence_dispatches', sourceType, sourceId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('correspondence_dispatches') as any)
        .select('id, subject, body, channel, status, sent_at, created_at, recipient_email, recipient_name')
        .eq('source_type', sourceType)
        .eq('source_id', sourceId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  if (isLoading) return <div className="p-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (data.length === 0) return <div className="p-4 text-sm text-muted-foreground text-center">No correspondence yet.</div>;

  return (
    <div className="divide-y">
      {data.map((d: any) => (
        <div key={d.id} className="py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{d.subject || '(no subject)'}</span>
            <Badge variant="outline">{d.channel}</Badge>
            <Badge variant={d.status === 'sent' ? 'default' : 'secondary'}>{d.status}</Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {formatDistanceToNow(new Date(d.sent_at || d.created_at), { addSuffix: true })}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            To: {d.recipient_name || '—'} {d.recipient_email ? `<${d.recipient_email}>` : ''}
          </div>
          <div className="text-sm mt-2 whitespace-pre-wrap line-clamp-4">{d.body}</div>
        </div>
      ))}
    </div>
  );
}
