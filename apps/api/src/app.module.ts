import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { ClsModule } from 'nestjs-cls';
import { ZodValidationPipe } from 'nestjs-zod';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { StaffGuard } from './auth/staff.guard';
import { BranchesModule } from './branches/branches.module';
import { DatabaseModule } from './common/db/database.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { REDIS, RedisModule } from './common/redis/redis.module';
import { ENV, type Env } from './config/env';
import { EnvModule } from './config/env.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    EnvModule,
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        // Keys must match RequestStore in common/context/request-context.ts.
        setup: (cls, req: Request) => {
          cls.set('ip', req.ip);
          cls.set('userAgent', req.headers['user-agent']);
        },
      },
    }),
    DatabaseModule,
    RedisModule,
    // Default limit per client IP; auth endpoints get stricter limits (flow.md 2.2).
    // Off in tests: the counters live in Redis and would carry over between test runs.
    ThrottlerModule.forRootAsync({
      inject: [REDIS, ENV],
      useFactory: (redis: Redis, env: Env) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        storage: new ThrottlerStorageRedisService(redis),
        skipIf: () => env.NODE_ENV === 'test',
      }),
    }),
    AuditModule,
    NotificationsModule,
    AuthModule,
    AdminModule,
    BranchesModule,
    UsersModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: rate limit first, then the staff session + lock + roles for /v1.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: StaffGuard },
  ],
})
export class AppModule {}
