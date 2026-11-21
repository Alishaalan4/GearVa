import { RolesOnly } from '@/components/roles-only';
import { RevenuePage } from '@/features/revenue/revenue-page';

/** flow.md 8.2, 8.3, step 7.5: revenue for owners and managers; receptionists see the debts. */
export default function RevenueRoute() {
  return (
    <RolesOnly roles={['OWNER', 'MANAGER', 'RECEPTIONIST']}>
      <RevenuePage />
    </RolesOnly>
  );
}
