import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Send, Search, User } from 'lucide-react';

const conversations = [
  { id: '1', name: 'Sarah Johnson', role: 'Admin', lastMessage: 'The application has been forwarded to the approver.', time: '10:30 AM', unread: 2 },
  { id: '2', name: 'Michael Chen', role: 'Reviewer', lastMessage: 'Please provide additional documentation.', time: '9:15 AM', unread: 0 },
  { id: '3', name: 'Emily Davis', role: 'Approver', lastMessage: 'Application APP-2024-0156 has been approved.', time: 'Yesterday', unread: 0 },
  { id: '4', name: 'System Notification', role: 'System', lastMessage: 'Your monthly return RET-2024-M01 is due in 5 days.', time: 'Yesterday', unread: 1 },
  { id: '5', name: 'Robert Wilson', role: 'Supervisor', lastMessage: 'Please review the Q4 compliance report.', time: 'Jan 14', unread: 0 },
];

export default function Messages() {
  const [selected, setSelected] = useState(conversations[0]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Messages" description="Internal messaging and communication." />
        <div className="grid lg:grid-cols-3 gap-6 animate-slide-up delay-100" style={{ minHeight: '60vh' }}>
          {/* Conversations */}
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search messages..." className="pl-10" />
                </div>
              </div>
              <div className="divide-y">
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelected(conv)}
                    className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${selected.id === conv.id ? 'bg-muted/50' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium shrink-0">
                        {conv.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-foreground truncate">{conv.name}</p>
                          <span className="text-xs text-muted-foreground">{conv.time}</span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                      </div>
                      {conv.unread > 0 && (
                        <Badge variant="default" className="shrink-0">{conv.unread}</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Chat */}
          <Card className="lg:col-span-2 flex flex-col">
            <div className="flex items-center gap-3 p-4 border-b">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                {selected.name.charAt(0)}
              </div>
              <div>
                <p className="font-medium">{selected.name}</p>
                <p className="text-sm text-muted-foreground">{selected.role}</p>
              </div>
            </div>
            <CardContent className="flex-1 p-4 flex flex-col justify-end">
              <div className="space-y-4 mb-4">
                <div className="flex justify-start">
                  <div className="max-w-xs bg-muted rounded-lg p-3 text-sm">{selected.lastMessage}</div>
                </div>
                <div className="flex justify-end">
                  <div className="max-w-xs bg-primary text-primary-foreground rounded-lg p-3 text-sm">Thank you, I'll review it shortly.</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Type a message..." className="flex-1" />
                <Button><Send className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
