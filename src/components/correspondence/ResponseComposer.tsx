import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send } from 'lucide-react';

export function ResponseComposer({ recipient }: { recipient: string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Channel</Label>
          <Select defaultValue="email">
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
          <Select defaultValue="none">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None / custom —</SelectItem>
              <SelectItem value="ack">Acknowledgement — Standard</SelectItem>
              <SelectItem value="ext-appr">Extension Approved</SelectItem>
              <SelectItem value="ext-rej">Extension Rejected</SelectItem>
              <SelectItem value="foi-resp">FOI Response</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <Input defaultValue={recipient} />
      </div>
      <div>
        <Label className="text-xs">Subject</Label>
        <Input defaultValue="Re: Request for extension on Q4 prudential return" />
      </div>
      <div>
        <Label className="text-xs">Body</Label>
        <Textarea rows={8} defaultValue={`Dear Ms. Mensah,\n\nWe acknowledge your request dated {{received_date}}. After review, we approve a 7-day extension for the Q4 2025 return, with a revised submission deadline of {{new_deadline}}.\n\nKind regards,\nSupervision Team`} />
      </div>
      <div className="flex justify-end">
        <Button data-rbac="settings.edit" size="sm"><Send className="h-4 w-4 mr-1" />Send response</Button>
      </div>
    </div>
  );
}
