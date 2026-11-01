import { VisitPage } from '@/features/visits/visit-page';

/** ?done=1: we came here right after "Confirm and finish". */
export default async function VisitRoute({
  params,
  searchParams,
}: {
  params: Promise<{ visitId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ visitId }, { done }] = await Promise.all([params, searchParams]);
  return <VisitPage visitId={visitId} justDone={done === '1'} />;
}
