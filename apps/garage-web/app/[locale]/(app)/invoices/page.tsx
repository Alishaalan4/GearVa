import { RolesOnly } from '@/components/roles-only';
import { InvoicesPage } from '@/features/invoices/invoices-page';

/**
 * ?filter=REFUND opens the cancelled invoices that still hold money; ?tab=settings opens the
 * invoice settings (owner, step 7.2).
 */
export default async function InvoicesRoute({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; tab?: string }>;
}) {
  const { filter, tab } = await searchParams;
  return (
    <RolesOnly roles={['OWNER', 'MANAGER', 'RECEPTIONIST']}>
      <InvoicesPage initialFilter={filter} initialTab={tab} />
    </RolesOnly>
  );
}
