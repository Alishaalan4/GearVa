import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthResponse } from '@gearva/contracts';

// Unauthenticated and outside the /v1 prefixes: used by Render's health check
// and the uptime monitor (README section 9), so it is not rate limited.
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
