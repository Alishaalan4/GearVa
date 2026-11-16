import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type OwnerGarage,
  type OwnerProfile,
  ownerChangePasswordSchema,
  ownerDeleteAccountSchema,
  ownerPreferencesSchema,
  updateOwnerProfileSchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Throttle } from '@nestjs/throttler';
import { Audit } from '../audit/audit.decorator';
import { OwnerAccountService } from './owner-account.service';

class UpdateOwnerProfileDto extends createZodDto(updateOwnerProfileSchema) {}
class OwnerPreferencesDto extends createZodDto(ownerPreferencesSchema) {}
class OwnerChangePasswordDto extends createZodDto(ownerChangePasswordSchema) {}
class OwnerDeleteAccountDto extends createZodDto(ownerDeleteAccountSchema) {}

/** Password checks: as strict as the login. */
const PASSWORD_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/** mobile-api.md 3.1, 3.2, 3.4, 3.5. Signed in (OwnerGuard). */
@Controller('mobile/v1/me')
export class OwnerMeController {
  constructor(private readonly account: OwnerAccountService) {}

  @Get()
  profile(): Promise<OwnerProfile> {
    return this.account.profile();
  }

  @Patch()
  @Audit('owner.update', 'owner')
  update(@Body() body: UpdateOwnerProfileDto): Promise<OwnerProfile> {
    return this.account.update(body);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(PASSWORD_LIMIT)
  @Audit('owner.change_password', 'owner')
  changePassword(@Body() body: OwnerChangePasswordDto): Promise<void> {
    return this.account.changePassword(body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(PASSWORD_LIMIT)
  @Audit('owner.delete_account', 'owner')
  deleteAccount(@Body() body: OwnerDeleteAccountDto): Promise<void> {
    return this.account.deleteAccount(body.password);
  }
}

/** mobile-api.md 3.3 (and 3.6, the logo, in step 6.3). Signed in (OwnerGuard). */
@Controller('mobile/v1/garages')
export class OwnerGaragesController {
  constructor(private readonly account: OwnerAccountService) {}

  @Patch(':garageId/preferences')
  // The row's garage is the :garageId param; the entity is that garage.
  @Audit('owner.preferences', 'garage')
  setPreferences(
    @Param('garageId', ParseUUIDPipe) garageId: string,
    @Body() body: OwnerPreferencesDto,
  ): Promise<OwnerGarage> {
    return this.account.setPreferences(garageId, body);
  }
}
