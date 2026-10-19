import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@gearva/contracts';

// Unauthenticated and outside the /v1 prefixes: used by Render's health check
// and the uptime monitor (README section 9).
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
