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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AdminLoginResponse,
  type AdminProfile,
  type AdminSessionResponse,
  type AdminTotpSetupResponse,
  ERROR_CODES,
  adminLoginSchema,
  adminTotpVerifySchema,
} from '@gearva/contracts';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../../audit/audit.decorator';
import {
  ADMIN_COOKIES,
  clearAdminMfaCookie,
  clearAdminSessionCookies,
  setAdminMfaCookie,
  setAdminSessionCookies,
} from '../../auth/cookies';
import { SessionService } from '../../auth/session.service';
import { RequestContext } from '../../common/context/request-context';
import { AppException } from '../../common/errors/app-exception';
import { ENV, type Env } from '../../config/env';
import { AdminGuard } from '../admin.guard';
import { AdminAuthService } from './admin-auth.service';

class AdminLoginDto extends createZodDto(adminLoginSchema) {}
class AdminTotpVerifyDto extends createZodDto(adminTotpVerifySchema) {}

/** Stricter than the global limit: login steps are what attackers hammer (flow.md 2.2). */
const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

function cookie(req: Request, name: string): string | undefined {
  const value: unknown = req.cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** flow.md 2.3. Route prefix /admin/v1 (README section 3). */
@Controller('admin/v1/auth')
export class AdminAuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AdminAuthService,
    private readonly sessions: SessionService,
    private readonly context: RequestContext,
    @Inject(ENV) env: Env,
  ) {
    this.secureCookies = env.NODE_ENV === 'production';
  }

  /** Step 1. Sets a 5-minute 2FA challenge cookie; no session yet (so no audit row). */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @Audit('admin.login.password', 'admin_user')
  async login(
    @Body() body: AdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminLoginResponse> {
    const { adminId, next } = await this.auth.checkPassword(body);
    setAdminMfaCookie(res, this.secureCookies, await this.sessions.signAdminMfa(adminId));
    return { next };
  }

  /** First login only: returns the secret for the authenticator app (shown as a QR). */
  @Post('totp/setup')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @Audit('admin.totp.setup', 'admin_user')
  async setupTotp(@Req() req: Request): Promise<AdminTotpSetupResponse> {
    return this.auth.setupTotp(await this.challengedAdmin(req));
  }

  /** Step 2. Opens the session: access + refresh cookies. */
  @Post('totp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @Audit('admin.login', 'admin_user')
  async verifyTotp(
    @Req() req: Request,
    @Body() body: AdminTotpVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminSessionResponse> {
    const adminId = await this.challengedAdmin(req);
    const result = await this.auth.verifySecondFactor(adminId, body, this.clientMeta());
    clearAdminMfaCookie(res, this.secureCookies);
    setAdminSessionCookies(res, this.secureCookies, result.tokens);
    return { ...result.profile, recoveryCodes: result.recoveryCodes };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @Audit('admin.session.refresh', 'admin_user')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminProfile> {
    const token = cookie(req, ADMIN_COOKIES.refresh);
    const result = token ? await this.auth.refresh(token, this.clientMeta()) : null;
    if (!result) {
      clearAdminSessionCookies(res, this.secureCookies);
      throw new AppException(HttpStatus.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not signed in');
    }
    setAdminSessionCookies(res, this.secureCookies, result.tokens);
    return result.profile;
  }

  /** Works even with an expired access token: it only needs the refresh cookie. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('admin.logout', 'admin_user')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = cookie(req, ADMIN_COOKIES.refresh);
    if (token) await this.auth.logout(token);
    clearAdminSessionCookies(res, this.secureCookies);
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(): Promise<AdminProfile> {
    return this.auth.profile(this.context.actor?.id ?? '');
  }

  private async challengedAdmin(req: Request): Promise<string> {
    const token = cookie(req, ADMIN_COOKIES.mfa);
    const adminId = token ? await this.sessions.verifyAdminMfa(token) : null;
    if (!adminId) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'Sign in with your password first',
      );
    }
    return adminId;
  }

  private clientMeta() {
    return { ip: this.context.ip, userAgent: this.context.userAgent };
  }
}
