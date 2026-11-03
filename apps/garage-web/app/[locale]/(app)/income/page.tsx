import { RolesOnly } from '@/components/roles-only';
import { IncomeSummaryPage } from '@/features/invoices/income-summary';

export default function IncomePage() {
  return (
    <RolesOnly roles={['OWNER', 'MANAGER']}>
      <IncomeSummaryPage />
    </RolesOnly>
  );
}
