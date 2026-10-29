import { CustomerPage } from '@/features/customers/customer-page';

/** ?existing=1: we came here because the phone was already a customer. */
export default async function CustomerRoute({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ existing?: string }>;
}) {
  const [{ customerId }, { existing }] = await Promise.all([params, searchParams]);
  return <CustomerPage customerId={customerId} existing={existing === '1'} />;
}
