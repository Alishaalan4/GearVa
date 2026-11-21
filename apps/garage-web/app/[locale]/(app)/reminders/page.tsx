import { RolesOnly } from '@/components/roles-only';
import { RemindersPage } from '@/features/reminders/reminders-page';

/** ?tab=log opens the message log (owner and managers, step 7.3). */
export default async function RemindersRoute({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <RolesOnly roles={['OWNER', 'MANAGER', 'RECEPTIONIST']}>
      <RemindersPage initialTab={tab} />
    </RolesOnly>
  );
}
