import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Send, Phone } from 'lucide-react';

interface MailRecord {
  id: string;
  recipient: string;
  subject: string;
  type: string;
  sentDate: string;
  status: string;
}

const sentMessages: MailRecord[] = [
  { id: '1', recipient: 'john.smith@example.com', subject: 'Application Status Update', type: 'Email', sentDate: '2024-01-15 14:30', status: 'delivered' },
  { id: '2', recipient: '+1-555-0123', subject: 'Return Due Reminder', type: 'SMS', sentDate: '2024-01-15 09:00', status: 'delivered' },
  { id: '3', recipient: 'acme@insurance.com', subject: 'Penalty Notice', type: 'Email', sentDate: '2024-01-14 16:45', status: 'delivered' },
  { id: '4', recipient: '+1-555-0456', subject: 'Verification Code', type: 'SMS', sentDate: '2024-01-14 11:20', status: 'failed' },
  { id: '5', recipient: 'global@lifecorp.com', subject: 'License Renewal Reminder', type: 'Email', sentDate: '2024-01-13 08:00', status: 'delivered' },
];

const columns: Column<MailRecord>[] = [
  { key: 'type', label: 'Type', render: (r) => <Badge variant="outline">{r.type}</Badge> },
  { key: 'recipient', label: 'Recipient', render: (r) => <span className="font-medium text-foreground">{r.recipient}</span> },
  { key: 'subject', label: 'Subject' },
  { key: 'sentDate', label: 'Sent' },
  { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'delivered' ? 'approved' : 'rejected' as any} className="capitalize">{r.status}</Badge> },
];

export default function MailSms() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Mail & SMS" description="Send and track email and SMS communications." backHref="/dashboard" backLabel="Dashboard" />

        <Tabs defaultValue="compose" className="animate-slide-up delay-100">
          <TabsList>
            <TabsTrigger value="compose">Compose</TabsTrigger>
            <TabsTrigger value="sent">Sent Messages</TabsTrigger>
          </TabsList>

          <TabsContent value="compose">
            <Card>
              <CardHeader><CardTitle className="text-lg">Compose Message</CardTitle></CardHeader>
              <CardContent className="space-y-4 max-w-2xl">
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select defaultValue="email">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email"><div className="flex items-center gap-2"><Mail className="h-4 w-4" />Email</div></SelectItem>
                      <SelectItem value="sms"><div className="flex items-center gap-2"><Phone className="h-4 w-4" />SMS</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Recipient</Label><Input placeholder="Enter email or phone number..." /></div>
                <div className="space-y-2"><Label>Subject</Label><Input placeholder="Message subject..." /></div>
                <div className="space-y-2"><Label>Message</Label><Textarea placeholder="Type your message..." rows={6} /></div>
                <Button><Send className="h-4 w-4 mr-2" />Send Message</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sent">
            <DataTableShell columns={columns} data={sentMessages} searchPlaceholder="Search sent messages..." />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
