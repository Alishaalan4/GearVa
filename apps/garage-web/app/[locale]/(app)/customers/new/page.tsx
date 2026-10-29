import { NewCustomerForm } from '@/features/customers/new-customer-form';

/** A phone typed in the search box comes along as ?phone=. */
export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string | string[] }>;
}) {
  const { phone } = await searchParams;
  return <NewCustomerForm phone={typeof phone === 'string' ? phone : ''} />;
}
