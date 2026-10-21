import { GarageDetail } from '@/features/garages/garage-detail';

export default async function GaragePage({ params }: { params: Promise<{ garageId: string }> }) {
  const { garageId } = await params;
  return <GarageDetail garageId={garageId} />;
}
