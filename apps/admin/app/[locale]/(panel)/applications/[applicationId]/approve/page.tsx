import { ApproveApplication } from '@/features/applications/approve-application';

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <ApproveApplication id={applicationId} />;
}
