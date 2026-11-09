import { RolesOnly } from '@/components/roles-only';
import { NotificationLog } from '@/features/notifications/notification-log';

export default function NotificationsPage() {
  return (
    <RolesOnly roles={['OWNER', 'MANAGER']}>
      <NotificationLog />
    </RolesOnly>
  );
}
