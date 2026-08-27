/**
 * NOT-CEN-001 — Forward a notification to an internal colleague.
 *
 * Uses the `notification_forward` RPC which creates an internal (staff-only)
 * correspondence draft linked to the notification's source record and notifies
 * the recipient. Nothing is sent to a licensee.
 */
import { useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import type { AppNotification } from '@/contexts/NotificationsContext';

interface Props {
  notification: AppNotification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ForwardNotificationDialog({ notification, open, onOpenChange }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: users = [], isLoading } = useInternalUsers(search);

  const reset = () => { setSearch(''); setSelected(null); setNote(''); };

  const submit = async () => {
    if (!notification || !selected) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('notification_forward' as never, {
      _notification_id: notification.id,
      _to_user_id: selected,
      _note: note.trim() || null,
    } as never);
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Could not forward this notification');
      return;
    }
    const result = data as { reference?: string } | null;
    toast.success(
      result?.reference
        ? `Forwarded — internal note ${result.reference} created`
        : 'Notification forwarded',
    );
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Forward to a colleague</DialogTitle>
          <DialogDescription>
            Creates an internal note for the selected colleague. The licensee is not contacted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="forward-search">Colleague</Label>
            <Input
              id="forward-search"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
              {isLoading ? (
                <div className="p-4 flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : users.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No colleagues found</p>
              ) : (
                users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelected(u.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/60 ${selected === u.id ? 'bg-primary/10' : ''}`}
                  >
                    <span className="font-medium">{u.full_name || 'Unnamed user'}</span>
                    <span className="text-muted-foreground"> — {u.email}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="forward-note">Note (optional)</Label>
            <Textarea
              id="forward-note"
              rows={3}
              placeholder="Add context for your colleague…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <GuardedButton module="notification_management" action="dispatch" data-rbac="notification_management.dispatch" onClick={submit} disabled={!selected || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Forward
          </GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
