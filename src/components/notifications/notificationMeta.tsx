/**
 * Shared presentation metadata for notification severity / category badges.
 */
import type { JSX } from 'react';
import { AlertOctagon, AlertTriangle, Info, Circle } from 'lucide-react';
import type { NotificationCategory, NotificationSeverity } from '@/types/notifications';

export const SEVERITY_META: Record<NotificationSeverity, { label: string; icon: JSX.Element; className: string }> = {
  critical: { label: 'Critical', icon: <AlertOctagon className="h-4 w-4" />, className: 'bg-destructive/10 text-destructive border-destructive/30' },
  high: { label: 'High', icon: <AlertTriangle className="h-4 w-4" />, className: 'bg-warning/10 text-warning border-warning/30' },
  medium: { label: 'Medium', icon: <Info className="h-4 w-4" />, className: 'bg-primary/10 text-primary border-primary/30' },
  low: { label: 'Low', icon: <Circle className="h-3.5 w-3.5" />, className: 'bg-muted text-muted-foreground border-border' },
};

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  action_required: 'Action required',
  alert: 'Alert',
  system: 'System',
  info: 'Information',
};

export const NOTIFICATION_MODULES = [
  'licensing', 'applications', 'returns', 'fit_and_proper', 'prudential',
  'conduct', 'complaints', 'enforcement', 'reporting', 'communications', 'system',
];

export const URGENT_SEVERITIES: NotificationSeverity[] = ['critical', 'high'];
