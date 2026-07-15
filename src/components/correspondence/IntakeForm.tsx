import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Inbox, Upload } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES } from '@/pages/correspondence/seed';

export function IntakeForm() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Inbox className="h-4 w-4 mr-2" />Capture correspondence</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Capture incoming correspondence</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Channel</Label>
              <Select defaultValue="email">
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
              <Label className="text-xs">Suggested category</Label>
              <Select defaultValue="General">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Sender name</Label><Input placeholder="Full name" /></div>
            <div><Label className="text-xs">Sender organisation</Label><Input placeholder="Institution (optional)" /></div>
          </div>
          <div><Label className="text-xs">Subject</Label><Input placeholder="Brief subject line" /></div>
          <div><Label className="text-xs">Summary</Label><Textarea rows={4} placeholder="Short summary of the correspondence" /></div>
          <div className="border-dashed border-2 rounded-md p-4 text-center text-xs text-muted-foreground">
            <Upload className="h-4 w-4 mx-auto mb-1" />
            Drag &amp; drop attachments here, or click to browse. Files are scanned for malware on upload.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => setOpen(false)}>Capture &amp; auto-route</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
