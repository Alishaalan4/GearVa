import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { type VehicleDetail, createVehicleSchema, updateVehicleSchema } from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { VehiclesService } from './vehicles.service';

class CreateVehicleDto extends createZodDto(createVehicleSchema) {}
class UpdateVehicleDto extends createZodDto(updateVehicleSchema) {}

/** flow.md 1: every staff role adds and edits vehicles. */
@Controller('v1')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  /** flow.md 3.2.1: a new car for an existing customer. */
  @Post('customers/:customerId/vehicles')
  @Audit('vehicle.create', 'vehicle')
  create(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: CreateVehicleDto,
  ): Promise<VehicleDetail> {
    return this.vehicles.create(customerId, body);
  }

  @Get('vehicles/:vehicleId')
  detail(@Param('vehicleId', ParseUUIDPipe) vehicleId: string): Promise<VehicleDetail> {
    return this.vehicles.detail(vehicleId);
  }

  @Patch('vehicles/:vehicleId')
  @Audit('vehicle.update', 'vehicle')
  update(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() body: UpdateVehicleDto,
  ): Promise<VehicleDetail> {
    return this.vehicles.update(vehicleId, body);
  }
}
