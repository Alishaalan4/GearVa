import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CreateVehicleInput,
  ERROR_CODES,
  type PlateExistsDetails,
  type UpdateVehicleInput,
  type VehicleDetail,
  estimateCurrentKm,
  normalizePlate,
  toKm,
} from '@gearva/contracts';
import { Prisma, type TenantTx } from '@gearva/database';
import { AuditService } from '../audit/audit.service';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { customerNotFound } from '../customers/customers.service';
import { toCustomerSummary, toVehicleItem } from '../customers/mappers';
import { SuggestionsService } from '../suggestions/suggestions.service';

function vehicleNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Vehicle not found');
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * A garage's vehicles (flow.md 3.2, 3.2.1, database.md 4.3). The odometer is entered in
 * the car's unit and stored in km; it changes later only through visits (step 2.4).
 * A plate is unique per garage among cars that are not deleted.
 */
@Injectable()
export class VehiclesService {
  constructor(
    private readonly db: TenantDb,
    private readonly suggestions: SuggestionsService,
    private readonly audit: AuditService,
  ) {}

  /** flow.md 3.2.1: a car for an existing customer (any number of cars per customer). */
  async create(customerId: string, input: CreateVehicleInput): Promise<VehicleDetail> {
    const garageId = this.db.garageId;
    const plateNormalized = normalizePlate(input.plate);
    let vehicleId: string;
    try {
      vehicleId = await this.db.run(async (tx) => {
        const customer = await tx.garageCustomer.findFirst({
          where: { id: customerId, garageId, deletedAt: null },
        });
        if (!customer) throw customerNotFound();
        await this.assertPlateFree(tx, plateNormalized);

        const vehicle = await tx.vehicle.create({
          data: {
            garageId,
            garageCustomerId: customer.id,
            ownerId: customer.ownerId,
            plate: input.plate,
            plateNormalized,
            make: input.make,
            model: input.model,
            year: input.year ?? null,
            distanceUnit: input.distanceUnit,
            currentKm: toKm(input.odometer, input.distanceUnit),
            lastOdometerAt: new Date(),
            notes: input.notes ?? null,
          },
        });
        await this.suggestions.record(tx, garageId, 'VEHICLE_MAKE', input.make);
        await this.suggestions.record(tx, garageId, 'VEHICLE_MODEL', input.model);
        return vehicle.id;
      });
    } catch (error) {
      // Two people adding the same plate at once: answer like the check would have.
      if (isUniqueViolation(error)) {
        await this.db.run((tx) => this.assertPlateFree(tx, plateNormalized));
      }
      throw error;
    }
    return this.load(vehicleId);
  }

  /** The car with its customer and today's estimated km. Viewing it is audit logged. */
  async detail(vehicleId: string): Promise<VehicleDetail> {
    const detail = await this.load(vehicleId);
    await this.audit.record({ action: 'vehicle.view', entityType: 'vehicle', entityId: detail.id });
    return detail;
  }

  async update(vehicleId: string, input: UpdateVehicleInput): Promise<VehicleDetail> {
    const garageId = this.db.garageId;
    try {
      await this.db.run(async (tx) => {
        const current = await tx.vehicle.findFirst({
          where: { id: vehicleId, garageId, deletedAt: null },
        });
        if (!current) throw vehicleNotFound();
        const plateNormalized = input.plate === undefined ? undefined : normalizePlate(input.plate);
        if (plateNormalized !== undefined && plateNormalized !== current.plateNormalized) {
          await this.assertPlateFree(tx, plateNormalized);
        }
        await tx.vehicle.update({
          where: { id: current.id },
          data: {
            plate: input.plate,
            plateNormalized,
            make: input.make,
            model: input.model,
            year: input.year,
            distanceUnit: input.distanceUnit,
            notes: input.notes,
          },
        });
        if (input.make && input.make !== current.make) {
          await this.suggestions.record(tx, garageId, 'VEHICLE_MAKE', input.make);
        }
        if (input.model && input.model !== current.model) {
          await this.suggestions.record(tx, garageId, 'VEHICLE_MODEL', input.model);
        }
      });
    } catch (error) {
      if (isUniqueViolation(error) && input.plate !== undefined) {
        await this.db.run((tx) => this.assertPlateFree(tx, normalizePlate(input.plate as string)));
      }
      throw error;
    }
    return this.load(vehicleId);
  }

  /** flow.md 3.2 step 4: an existing plate shows the existing car instead of failing. */
  private async assertPlateFree(tx: TenantTx, plateNormalized: string): Promise<void> {
    const existing = await tx.vehicle.findFirst({
      where: { garageId: this.db.garageId, plateNormalized, deletedAt: null },
      include: { customer: { include: { owner: true } } },
    });
    if (!existing) return;
    const details: PlateExistsDetails = {
      vehicle: toVehicleItem(existing),
      customer: toCustomerSummary(existing.customer),
    };
    throw new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.VEHICLE_PLATE_EXISTS,
      'A car with this plate already exists in this garage',
      { ...details },
    );
  }

  private async load(vehicleId: string): Promise<VehicleDetail> {
    const garageId = this.db.garageId;
    const [vehicle, settings] = await this.db.run((tx) =>
      Promise.all([
        tx.vehicle.findFirst({
          where: { id: vehicleId, garageId, deletedAt: null },
          include: { customer: { include: { owner: true } } },
        }),
        tx.garageSettings.findUnique({
          where: { garageId },
          select: { defaultDailyKm: true },
        }),
      ]),
    );
    if (!vehicle) throw vehicleNotFound();
    const avgDailyKm = vehicle.avgDailyKm === null ? null : Number(vehicle.avgDailyKm);
    return {
      ...toVehicleItem(vehicle),
      notes: vehicle.notes,
      lastOdometerAt: vehicle.lastOdometerAt?.toISOString() ?? null,
      avgDailyKm,
      estimatedKm: estimateCurrentKm({
        currentKm: vehicle.currentKm,
        lastOdometerAt: vehicle.lastOdometerAt,
        avgDailyKm,
        garageDefaultDailyKm: settings?.defaultDailyKm,
      }),
      customer: toCustomerSummary(vehicle.customer),
      createdAt: vehicle.createdAt.toISOString(),
    };
  }
}
