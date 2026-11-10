import { ApplicationDetail } from '@/features/applications/application-detail';

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <ApplicationDetail id={applicationId} />;
}
