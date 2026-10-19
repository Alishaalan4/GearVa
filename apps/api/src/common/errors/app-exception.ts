import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@gearva/contracts';

/** Throw this for every expected error, so the client gets a stable code. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message, status);
  }
}
