import { RolesOnly } from '@/components/roles-only';
import { RemindersDue } from '@/features/reminders/reminders-due';

export default function RemindersPage() {
  return (
    <RolesOnly roles={['OWNER', 'MANAGER', 'RECEPTIONIST']}>
      <RemindersDue />
    </RolesOnly>
  );
}
