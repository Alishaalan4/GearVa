import { VisitPage } from '@/features/visits/visit-page';

/** ?finish=1: we came here from "Confirm and finish", so "Paid now?" is already open. */
export default async function VisitRoute({
  params,
  searchParams,
}: {
  params: Promise<{ visitId: string }>;
  searchParams: Promise<{ finish?: string }>;
}) {
  const [{ visitId }, { finish }] = await Promise.all([params, searchParams]);
  return <VisitPage visitId={visitId} startFinish={finish === '1'} />;
}
