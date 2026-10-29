import { NewVehicle } from '@/features/vehicles/new-vehicle';

export default async function NewVehiclePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <NewVehicle customerId={customerId} />;
}
