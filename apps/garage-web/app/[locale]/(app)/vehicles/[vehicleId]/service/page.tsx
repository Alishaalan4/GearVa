import { QuickEntryPage } from '@/features/quick-entry/quick-entry-page';

/** /vehicles/:id/service?type=<serviceTypeId> */
export default async function QuickEntryRoute({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const [{ vehicleId }, { type }] = await Promise.all([params, searchParams]);
  return <QuickEntryPage vehicleId={vehicleId} serviceTypeId={type} />;
}
