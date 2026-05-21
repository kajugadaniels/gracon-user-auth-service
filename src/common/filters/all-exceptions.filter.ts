/**
 * Global catch-all exception filter.
 *
 * Handles any exception that is NOT an HttpException — unhandled promise
 * rejections, database connection failures, null dereferences, third-party
 * SDK crashes, etc.
 *
 * Security concern: NestJS's built-in error handler includes the full stack
 * trace and error message in the response when NODE_ENV is not "production".
 * An attacker who triggers an uncaught error learns your framework version,
 * internal file paths, and the names of your internal modules.
 * This filter always returns a generic 500 envelope and logs the full error
 * server-side only.
 */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // Log the full stack trace server-side — never include it in the response
    const stack =
      exception instanceof Error ? exception.stack : String(exception);
    this.logger.error(`Unhandled exception — ${req.method} ${req.path}`, stack);

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
}
