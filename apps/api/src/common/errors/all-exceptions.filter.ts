import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@gearva/contracts';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { AppException } from './app-exception';

function hasIssues(error: unknown): error is { issues: unknown[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
};

/** Every error leaves the API as { code, message, details } (README section 5.6). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.toBody(exception);
    response.status(status).json(body);
  }

  private toBody(exception: unknown): [number, ApiErrorBody] {
    if (exception instanceof AppException) {
      return [
        exception.getStatus(),
        { code: exception.code, message: exception.message, details: exception.details },
      ];
    }

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      const issues = hasIssues(zodError) ? zodError.issues : [];
      return [
        HttpStatus.BAD_REQUEST,
        { code: ERROR_CODES.VALIDATION_FAILED, message: 'Validation failed', details: { issues } },
      ];
    }

    if (exception instanceof ThrottlerException) {
      return [
        HttpStatus.TOO_MANY_REQUESTS,
        { code: ERROR_CODES.RATE_LIMITED, message: 'Too many requests', details: {} },
      ];
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = CODE_BY_STATUS[status];
      if (code) return [status, { code, message: exception.message, details: {} }];
    }

    // Unknown errors never leak internals to the client.
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return [
      HttpStatus.INTERNAL_SERVER_ERROR,
      { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error', details: {} },
    ];
  }
}
