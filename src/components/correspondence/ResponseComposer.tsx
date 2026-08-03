import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Eye, Loader2, Send } from 'lucide-react';

import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dispatchNotificationEvent } from '@/lib/notificationEvents';
import { usePostCorrespondenceMessage, type CorrespondenceThread } from '@/hooks/useCorrespondence';

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

export function ResponseComposer({ thread }: { thread: CorrespondenceThread }) {
  const [channel, setChannel] = useState<string>(thread.channel === 'portal' ? 'portal' : 'email');
  const [templateId, setTemplateId] = useState('none');
  const [recipient, setRecipient] = useState(thread.sender_email ?? '');
  const [subject, setSubject] = useState(`Re: ${thread.subject}`);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const post = usePostCorrespondenceMessage(thread.id);

  const { data: templates = [] } = useQuery({
    queryKey: ['correspondence_templates', 'active'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('correspondence_templates')
        .select('id, name, code, category, channel, subject, body')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const tokens = useMemo(
    () => ({
      reference: thread.reference,
      subject: thread.subject,
      sender_name: thread.sender_name,
      sender_org: thread.sender_org ?? '',
      category: thread.category,
      received_date: new Date(thread.received_at).toLocaleDateString(),
      due_date: thread.due_at ? new Date(thread.due_at).toLocaleDateString() : '',
    }),
    [thread],
  );

  useEffect(() => {
    if (templateId === 'none') return;
    const t = templates.find((x: any) => x.id === templateId);
    if (t) {
      setSubject(render(t.subject ?? '', tokens) || `Re: ${thread.subject}`);
      setBody(render(t.body ?? '', tokens));
      if (t.channel) setChannel(t.channel);
    }
  }, [templateId, templates, tokens, thread.subject]);

  const send = async () => {
    if (!body.trim()) { toast.error('Response body is required.'); return; }
    setBusy(true);
    try {
      await post.mutateAsync({
        thread_id: thread.id,
        body: body.trim(),
        subject: subject.trim(),
        channel,
        is_internal_note: false,
      });
      toast.success('Response recorded and sent');
      setBody('');
      setTemplateId('none');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not send response');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Channel</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="letter">Letter</SelectItem>
              <SelectItem value="portal">Portal</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None / custom —</SelectItem>
              {templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="recipient@example.com" />
      </div>
      <div>
        <Label className="text-xs">Subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Body</Label>
          <span className="text-[11px] text-muted-foreground">{body.length} / 5000 characters</span>
        </div>
        <Textarea rows={8} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the response…" />
      </div>
      <div className="flex justify-end gap-2">
        <Dialog open={preview} onOpenChange={setPreview}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={!body.trim()}><Eye className="h-4 w-4 mr-1" />Preview</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Preview response</DialogTitle></DialogHeader>
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">To:</span> {recipient || thread.sender_email || '—'}</div>
              <div><span className="text-muted-foreground">Subject:</span> {subject}</div>
              <div className="rounded border bg-muted/40 p-3 whitespace-pre-wrap">{body}</div>
            </div>
          </DialogContent>
        </Dialog>
        <Button data-rbac="correspondence_management.approve" size="sm" onClick={send} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}Send response
        </Button>
      </div>

    </div>
  );
}
