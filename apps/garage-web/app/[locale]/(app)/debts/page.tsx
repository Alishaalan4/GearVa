import { RolesOnly } from '@/components/roles-only';
import { DebtList } from '@/features/invoices/debt-list';

export default function DebtsPage() {
  return (
    <RolesOnly roles={['OWNER', 'MANAGER', 'RECEPTIONIST']}>
      <DebtList />
    </RolesOnly>
  );
}
