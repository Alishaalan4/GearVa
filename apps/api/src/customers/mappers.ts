import type { CustomerSummary, VehicleItem } from '@gearva/contracts';
import type { GarageCustomer, Owner, Vehicle } from '@gearva/database';

// Row -> API shape, shared by customers, vehicles and search.

export function toCustomerSummary(customer: GarageCustomer & { owner: Owner }): CustomerSummary {
  return { id: customer.id, name: customer.name, phone: customer.owner.phone };
}

export function toVehicleItem(vehicle: Vehicle): VehicleItem {
  return {
    id: vehicle.id,
    plate: vehicle.plate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    distanceUnit: vehicle.distanceUnit,
    currentKm: vehicle.currentKm,
  };
}
