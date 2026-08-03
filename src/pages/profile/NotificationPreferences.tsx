/**
 * Profile → Notifications. Shares the single canonical preference matrix with
 * Settings → Notifications so both surfaces read and write the same model.
 */
import { NotificationPreferenceMatrix } from '@/components/notifications/NotificationPreferenceMatrix';

export default function NotificationPreferences() {
  return <NotificationPreferenceMatrix />;
}
