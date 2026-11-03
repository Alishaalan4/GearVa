import { RolesOnly } from '@/components/roles-only';
import { InvoiceList } from '@/features/invoices/invoice-list';

/** ?filter=REFUND opens the cancelled invoices that still hold money. */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  return (
    <RolesOnly roles={['OWNER', 'MANAGER', 'RECEPTIONIST']}>
      <InvoiceList initialFilter={filter} />
    </RolesOnly>
  );
}
