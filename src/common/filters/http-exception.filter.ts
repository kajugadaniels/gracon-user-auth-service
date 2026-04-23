/**
 * Global HTTP exception filter.
 *
 * Intercepts every HttpException (400–499 thrown by NestJS, ValidationPipe,
 * or application code) and returns a safe, consistent JSON envelope.
 *
 * Security concern: NestJS's default exception handler passes the full
 * class-validator error object to the response when ValidationPipe throws.
 * That object contains field names, constraint keys, and sometimes the
 * reflected request value — leaking your DTO shape to any caller.
 * This filter detects the ValidationPipe array format and returns only a
 * single explicit message when exactly one validator failed; otherwise it
 * falls back to a fixed safe string.
 *
 * For exceptions thrown by application service code (e.g. UnauthorizedException,
 * ConflictException with a specific message), the developer-supplied message
 * string is passed through unchanged since it is intentional client feedback.
 */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Maps HTTP status codes to human-readable reason phrases for the envelope. */
const HTTP_REASON_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Log full details server-side so engineers can debug without
    // those details ever reaching the client.
    this.logger.warn(
      `HTTP ${status} — ${req.method} ${req.path} — ${exception.message}`,
    );

    res.status(status).json({
      statusCode: status,
      error: HTTP_REASON_PHRASES[status] ?? 'Error',
      message: this.safeMessage(status, exceptionResponse),
    });
  }

  /**
   * Produces a client-safe message string.
   *
   * ValidationPipe throws BadRequestException with `message` as a string[].
   * When there is exactly one user-facing validation message we can safely
   * return it directly. For multi-error arrays we collapse to one generic
   * string instead of exposing the whole DTO validation surface.
   * All other HttpException messages are strings set by application code
   * and are intentional client feedback, so they pass through.
   */
  private safeMessage(
    status: number,
    exceptionResponse: string | object,
  ): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    const body = exceptionResponse as Record<string, unknown>;

    // ValidationPipe sets message to a string[] — expose only the single
    // user-facing message when there is exactly one failure.
    if (Array.isArray(body.message)) {
      if (
        body.message.length === 1 &&
        typeof body.message[0] === 'string' &&
        body.message[0].length > 0
      ) {
        return body.message[0];
      }

      return 'Validation failed. Check your request and try again.';
    }

    // Application code set a message string — pass it through
    if (typeof body.message === 'string' && body.message.length > 0) {
      return body.message;
    }

    // Fallback to the reason phrase
    return HTTP_REASON_PHRASES[status] ?? 'An error occurred.';
  }
}
