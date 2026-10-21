import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV, type Env } from '../config/env';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffGuard } from './staff.guard';
import { TotpService } from './totp.service';
import { UserAccessLinksService } from './user-access-links.service';

/** Sessions, passwords, 2FA, access links; staff sign-in (/v1/auth) and its guard. */
@Module({
  imports: [
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [StaffAuthController],
  providers: [
    LoginAttemptsService,
    PasswordService,
    SessionService,
    StaffAuthService,
    StaffGuard,
    TotpService,
    UserAccessLinksService,
  ],
  exports: [
    LoginAttemptsService,
    PasswordService,
    SessionService,
    StaffGuard,
    TotpService,
    UserAccessLinksService,
  ],
})
export class AuthModule {}
