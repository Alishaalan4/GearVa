import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type OwnerAuthResponse,
  type OwnerSetPasswordResponse,
  ownerForgotPasswordSchema,
  ownerLoginSchema,
  ownerRefreshSchema,
  ownerSetPasswordSchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Public } from '../auth/staff-access.decorators';
import { RequestContext } from '../common/context/request-context';
import { OwnerAuthService } from './owner-auth.service';

class OwnerSetPasswordDto extends createZodDto(ownerSetPasswordSchema) {}
class OwnerLoginDto extends createZodDto(ownerLoginSchema) {}
class OwnerRefreshDto extends createZodDto(ownerRefreshSchema) {}
class OwnerForgotPasswordDto extends createZodDto(ownerForgotPasswordSchema) {}

/** mobile-api.md 2.2: 10 tries per minute per IP (plus the per-email lockout). */
const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/**
 * The owner app's auth (prefix /mobile/v1, README 3; docs/mobile-api.md 2). Every route
 * here is @Public: the body (password, refresh token or link token) decides who acts.
 */
@Controller('mobile/v1/auth')
@Public()
export class OwnerAuthController {
  constructor(
    private readonly auth: OwnerAuthService,
    private readonly context: RequestContext,
  ) {}

  /** gearva.online/owner/set-password posts here (forwarded by garage-web). */
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @Audit('owner.set_password', 'owner')
  setPassword(@Body() body: OwnerSetPasswordDto): Promise<OwnerSetPasswordResponse> {
    return this.auth.setPassword(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @Audit('owner.login', 'owner')
  login(@Body() body: OwnerLoginDto): Promise<OwnerAuthResponse> {
    return this.auth.login(body, this.clientMeta());
  }

  /** The app refreshes on its own every 15 minutes, so this allows more. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Audit('owner.session.refresh', 'owner')
  refresh(@Body() body: OwnerRefreshDto): Promise<OwnerAuthResponse> {
    return this.auth.refresh(body.refreshToken, this.clientMeta());
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('owner.logout', 'owner')
  logout(@Body() body: OwnerRefreshDto): Promise<void> {
    return this.auth.logout(body.refreshToken);
  }

  /** Always 202: the answer never tells whether the email has an account. */
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Audit('owner.forgot_password', 'owner')
  async forgotPassword(@Body() body: OwnerForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(body.email);
  }

  private clientMeta() {
    return { ip: this.context.ip, userAgent: this.context.userAgent };
  }
}
