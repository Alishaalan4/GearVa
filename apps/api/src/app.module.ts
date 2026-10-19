import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { ClsModule } from 'nestjs-cls';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuditModule } from './audit/audit.module';
import { DatabaseModule } from './common/db/database.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { REDIS, RedisModule } from './common/redis/redis.module';
import { EnvModule } from './config/env.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';

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
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    AuditModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
