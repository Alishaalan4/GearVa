import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ERROR_CODES,
  type StaffProfile,
  setPasswordSchema,
  staffLoginSchema,
  viewAsSchema,
} from '@gearva/contracts';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { RequestContext } from '../common/context/request-context';
import { AppException } from '../common/errors/app-exception';
import { ENV, type Env } from '../config/env';
import { STAFF_COOKIES, clearStaffSessionCookies, setStaffSessionCookies } from './cookies';
import { Public } from './staff-access.decorators';
import { StaffAuthService } from './staff-auth.service';
import { VIEW_AS_TTL_SECONDS, ViewAsService } from './view-as.service';

class SetPasswordDto extends createZodDto(setPasswordSchema) {}
class StaffLoginDto extends createZodDto(staffLoginSchema) {}
class ViewAsDto extends createZodDto(viewAsSchema) {}

const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

function cookie(req: Request, name: string): string | undefined {
  const value: unknown = req.cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Garage staff auth (flow.md 2.1, 2.2). Prefix /v1 (README section 3). */
@Controller('v1/auth')
export class StaffAuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: StaffAuthService,
    private readonly viewAsService: ViewAsService,
    private readonly context: RequestContext,
    @Inject(ENV) env: Env,
  ) {
    this.secureCookies = env.NODE_ENV === 'production';
  }

  /** The invite / password-reset link page posts here; on success the user is signed in. */
  @Post('set-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @Audit('user.set_password', 'user')
  async setPassword(
    @Body() body: SetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StaffProfile> {
    const { profile, tokens } = await this.auth.setPassword(body, this.clientMeta());
    setStaffSessionCookies(res, this.secureCookies, tokens);
    return profile;
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @Audit('user.login', 'user')
  async login(
    @Body() body: StaffLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StaffProfile> {
    const { profile, tokens } = await this.auth.login(body, this.clientMeta());
    setStaffSessionCookies(res, this.secureCookies, tokens);
    return profile;
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @Audit('user.session.refresh', 'user')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StaffProfile> {
    const token = cookie(req, STAFF_COOKIES.refresh);
    try {
      const result = token ? await this.auth.refresh(token, this.clientMeta()) : null;
      if (!result) {
        throw new AppException(HttpStatus.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not signed in');
      }
      setStaffSessionCookies(res, this.secureCookies, result.tokens);
      return result.profile;
    } catch (error) {
      // A lock keeps the session (flow.md 2.5): the cookies stay, so the same session
      // works again once the garage is unlocked. Any other failure signs the browser out.
      const locked = error instanceof AppException && error.code === ERROR_CODES.GARAGE_LOCKED;
      if (!locked) clearStaffSessionCookies(res, this.secureCookies);
      throw error;
    }
  }

  /** Works even with an expired access token or a locked garage. */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('user.logout', 'user')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = cookie(req, STAFF_COOKIES.refresh);
    if (token) await this.auth.logout(token);
    clearStaffSessionCookies(res, this.secureCookies);
  }

  /**
   * flow.md 11.3: garage-web's /view-as page trades the admin's one-time code for a
   * 1-hour read-only session in that garage. The code alone decides admin and garage.
   */
  @Post('view-as')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  // The response is the admin's profile, so the entity is the admin; the row's garage
  // comes from the actor set below (the garage being viewed).
  @Audit('admin.view_as.start', 'admin_user')
  async viewAs(
    @Body() body: ViewAsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StaffProfile> {
    const { profile, accessToken, refreshToken } = await this.viewAsService.exchange(
      body.code,
      this.clientMeta(),
    );
    setStaffSessionCookies(
      res,
      this.secureCookies,
      { accessToken, refreshToken },
      VIEW_AS_TTL_SECONDS,
    );
    this.context.setActor({
      type: 'ADMIN',
      id: profile.id,
      garageId: profile.garage.id,
      role: 'OWNER',
      branchId: null,
    });
    return profile;
  }

  /** Signed in (StaffGuard): who am I, which garage. An admin viewing it is view-only. */
  @Get('me')
  me(): Promise<StaffProfile> {
    return this.context.actor?.type === 'ADMIN'
      ? this.viewAsService.profile()
      : this.auth.profile();
  }

  private clientMeta() {
    return { ip: this.context.ip, userAgent: this.context.userAgent };
  }
}
