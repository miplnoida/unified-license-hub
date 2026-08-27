/**
 * NOT-CEN-001 — Notification detail drawer.
 *
 * Shows the full message, source record deep link, delivery attempts per
 * channel and the read/actioned/archive controls. Delivery rows come from
 * `notification_delivery_for`, which only returns the caller's own records.
 */
import { useEffect, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { useNavigate } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Archive, ExternalLink, Forward, Loader2, Mail, MessageSquare, Bell, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { notificationLink } from '@/lib/notificationLinks';
import { resolveNotificationStatus } from '@/types/notifications';
import type { AppNotification } from '@/contexts/NotificationsContext';
import { SEVERITY_META, CATEGORY_LABELS } from './notificationMeta';

interface DeliveryRow {
  channel: string;
  status: string;
  provider: string | null;
  queued_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  retry_count: number;
  error: string | null;
}

const CHANNEL_ICON: Record<string, JSX.Element> = {
  email: <Mail className="h-3.5 w-3.5" />,
  sms: <MessageSquare className="h-3.5 w-3.5" />,
  in_app: <Bell className="h-3.5 w-3.5" />,
};

interface Props {
  notification: AppNotification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchive: (id: string) => void | Promise<void>;
  onMarkRead: (id: string) => void | Promise<void>;
  onMarkActioned: (id: string, target?: string) => void | Promise<void>;
  onForward: (n: AppNotification) => void;
}

export function NotificationDetailDrawer({
  notification, open, onOpenChange, onArchive, onMarkRead, onMarkActioned, onForward,
}: Props) {
  const navigate = useNavigate();
  const [delivery, setDelivery] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !notification) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setDeliveryError(null);
      const { data, error } = await supabase.rpc('notification_delivery_for' as never, {
        _notification_id: notification.id,
      } as never);
      if (cancelled) return;
      if (error) setDeliveryError('Delivery history is unavailable right now.');
      else setDelivery((data || []) as unknown as DeliveryRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, notification]);

  if (!notification) return null;

  const sev = SEVERITY_META[notification.severity] ?? SEVERITY_META.medium;
  const status = resolveNotificationStatus(notification);
  const link = notification.source_route
    || notificationLink(notification.entity_type, notification.entity_id, notification.metadata);

  const openRecord = async () => {
    if (!link) return;
    await onMarkActioned(notification.id, link);
    onOpenChange(false);
    navigate(link);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[10px] px-1.5 ${sev.className}`}>{sev.label}</Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {CATEGORY_LABELS[notification.category] ?? notification.category}
            </Badge>
            {notification.module && (
              <Badge variant="outline" className="text-[10px] px-1.5 capitalize">
                {notification.module.replace(/_/g, ' ')}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] px-1.5 capitalize">{status}</Badge>
          </div>
          <SheetTitle className="text-left">{notification.title}</SheetTitle>
          <SheetDescription className="text-left">
            {format(new Date(notification.created_at), 'd MMM yyyy, h:mm a')}
            {notification.source_reference ? ` · ${notification.source_reference}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{notification.message}</p>

          <div className="flex flex-wrap gap-2">
            {link && (
              <Button size="sm" onClick={openRecord}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Open record
              </Button>
            )}
            {status === 'unread' && (
              <Button size="sm" variant="outline" onClick={() => onMarkRead(notification.id)}>
                <Check className="h-3.5 w-3.5 mr-1.5" />Mark read
              </Button>
            )}
            <GuardedButton module="notification_management" action="dispatch" data-rbac="notification_management.dispatch" size="sm" variant="outline" onClick={() => onForward(notification)}>
              <Forward className="h-3.5 w-3.5 mr-1.5" />Forward
            </GuardedButton>
            {status !== 'archived' && status !== 'dismissed' && !notification.system_required && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => { await onArchive(notification.id); onOpenChange(false); }}
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" />Archive
              </Button>
            )}
            {notification.system_required && (
              <span className="text-xs text-muted-foreground self-center">
                Regulatory notice — cannot be archived
              </span>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Delivery
            </p>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : deliveryError ? (
              <p className="text-sm text-muted-foreground">{deliveryError}</p>
            ) : delivery.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Delivered in-app only. No email or SMS was dispatched for this notification.
              </p>
            ) : (
              <div className="space-y-2">
                {delivery.map((d, i) => (
                  <div key={i} className="rounded-md border p-2.5 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      {CHANNEL_ICON[d.channel] ?? <Bell className="h-3.5 w-3.5" />}
                      <span className="font-medium capitalize">{d.channel.replace(/_/g, ' ')}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 capitalize ${
                          ['sent', 'delivered'].includes(d.status)
                            ? 'border-success/40 text-success'
                            : ['failed', 'bounced'].includes(d.status)
                              ? 'border-destructive/40 text-destructive'
                              : ''
                        }`}
                      >
                        {d.status}
                      </Badge>
                      {d.retry_count > 0 && (
                        <span className="text-muted-foreground">{d.retry_count} retries</span>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {d.delivered_at
                        ? `Delivered ${format(new Date(d.delivered_at), 'd MMM yyyy, h:mm a')}`
                        : d.sent_at
                          ? `Sent ${format(new Date(d.sent_at), 'd MMM yyyy, h:mm a')}`
                          : d.failed_at
                            ? `Failed ${format(new Date(d.failed_at), 'd MMM yyyy, h:mm a')}`
                            : 'Queued'}
                    </p>
                    {d.error && <p className="text-destructive">{d.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {notification.event_key && (
            <p className="text-[11px] text-muted-foreground">
              Event: <span className="font-mono">{notification.event_key}</span>
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function copyReference(reference: string | null) {
  if (!reference) return;
  navigator.clipboard?.writeText(reference);
  toast.success('Reference copied');
}
