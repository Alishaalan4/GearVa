import { VehiclePage } from '@/features/vehicles/vehicle-page';

export default async function VehicleRoute({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  return <VehiclePage vehicleId={vehicleId} />;
}
