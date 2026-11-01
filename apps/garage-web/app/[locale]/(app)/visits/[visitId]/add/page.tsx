import { AddServicePage } from '@/features/quick-entry/quick-entry-page';

/** /visits/:id/add?type=<serviceTypeId>: one more service on an open visit. */
export default async function AddServiceRoute({
  params,
  searchParams,
}: {
  params: Promise<{ visitId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const [{ visitId }, { type }] = await Promise.all([params, searchParams]);
  return <AddServicePage visitId={visitId} serviceTypeId={type} />;
}
