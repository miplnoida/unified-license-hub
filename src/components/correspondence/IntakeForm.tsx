import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Inbox, Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CATEGORIES } from '@/pages/correspondence/seed';
import { useCreateCorrespondenceThread, uploadCorrespondenceFile } from '@/hooks/useCorrespondence';

export function IntakeForm() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const create = useCreateCorrespondenceThread();

  const [channel, setChannel] = useState('email');
  const [category, setCategory] = useState('General');
  const [priority, setPriority] = useState('normal');
  const [senderName, setSenderName] = useState('');
  const [senderOrg, setSenderOrg] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [threadType, setThreadType] = useState<ThreadType>('general_correspondence');
  const [sourceType, setSourceType] = useState('none');
  const [sourceReference, setSourceReference] = useState('');
  const [licenseeId, setLicenseeId] = useState('none');
  const [licenseeQuery, setLicenseeQuery] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);


  const { data: licensees = [] } = useQuery({
    queryKey: ['correspondence-licensee-search', licenseeQuery],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('search_licensees', {
        _q: licenseeQuery || '', _limit: 20, _offset: 0,
      });
      if (error) return [];
      return (data ?? []) as any[];
    },
  });

  const reset = () => {
    setChannel('email'); setCategory('General'); setPriority('normal');
    setSenderName(''); setSenderOrg(''); setSenderEmail(''); setSubject('');
    setSummary(''); setBody(''); setTags(''); setLicenseeId('none'); setFiles([]);
  };

  const submit = async () => {
    if (!subject.trim() || !senderName.trim()) {
      toast.error('Sender name and subject are required.');
      return;
    }
    setSaving(true);
    try {
      const id = await create.mutateAsync({
        subject: subject.trim(),
        summary: summary.trim() || undefined,
        sender_name: senderName.trim(),
        sender_org: senderOrg.trim() || undefined,
        sender_email: senderEmail.trim() || undefined,
        channel,
        category,
        priority,
        licensee_id: licenseeId === 'none' ? null : licenseeId,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        body: body.trim() || undefined,
      });
      for (const f of files) {
        await uploadCorrespondenceFile(id, f);
      }
      toast.success('Correspondence captured and routed');
      setOpen(false);
      reset();
      navigate(`/correspondence/${id}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not capture correspondence');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-rbac="correspondence_management.approve"><Inbox className="h-4 w-4 mr-2" />Capture correspondence</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Capture incoming correspondence</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="letter">Letter (physical)</SelectItem>
                  <SelectItem value="portal">Portal</SelectItem>
                  <SelectItem value="fax">Fax</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Sender name *</Label><Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Full name" /></div>
            <div><Label className="text-xs">Sender organisation</Label><Input value={senderOrg} onChange={(e) => setSenderOrg(e.target.value)} placeholder="Institution (optional)" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Sender email</Label><Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="name@example.com" /></div>
            <div>
              <Label className="text-xs">Link to licensee (enables portal replies)</Label>
              <Input className="mb-1" value={licenseeQuery} onChange={(e) => setLicenseeQuery(e.target.value)} placeholder="Search entity…" />
              <Select value={licenseeId} onValueChange={setLicenseeId}>
                <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {licensees.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.entity_name ?? l.name ?? l.legal_name ?? l.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div><Label className="text-xs">Subject *</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief subject line" /></div>
          <div><Label className="text-xs">Summary</Label><Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Short summary of the correspondence" /></div>
          <div><Label className="text-xs">Message content</Label><Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Transcribe or paste the correspondence text" /></div>
          <div><Label className="text-xs">Tags (comma separated)</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="prudential, extension" /></div>

          <div>
            <Label className="text-xs">Attachments</Label>
            <Input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip className="h-3 w-3" />{f.name}
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button data-rbac="correspondence_management.approve" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Capture &amp; auto-route
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
