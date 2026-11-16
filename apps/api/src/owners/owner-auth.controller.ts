import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type OwnerSetPasswordResponse, ownerSetPasswordSchema } from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { OwnerAuthService } from './owner-auth.service';

class OwnerSetPasswordDto extends createZodDto(ownerSetPasswordSchema) {}

const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/**
 * The owner app's auth (prefix /mobile/v1, README 3; docs/mobile-api.md 2). Outside /v1,
 * so StaffGuard does not apply. Step 6.1 has only the web page's set-password; login,
 * refresh, logout and forgot-password come in step 6.2.
 */
@Controller('mobile/v1/auth')
export class OwnerAuthController {
  constructor(private readonly auth: OwnerAuthService) {}

  /** gearva.online/owner/set-password posts here (forwarded by garage-web). */
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @Audit('owner.set_password', 'owner')
  setPassword(@Body() body: OwnerSetPasswordDto): Promise<OwnerSetPasswordResponse> {
    return this.auth.setPassword(body);
  }
}
