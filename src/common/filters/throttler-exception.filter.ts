// Catches ThrottlerException thrown by the rate limiter and returns
// a clean, consistent JSON response instead of NestJS's default
// plain-string error body.
// Without this filter the frontend would receive a string that looks like:
// '{"statusCode":429,"error":"Too Many Requests","message":"..."}'
// — double-encoded because ThrottlerException.message is already JSON.
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    // Retry-After header tells the client how long to wait (seconds)
    // We use 60s as a safe default — matches the auth throttle window
    res.status(HttpStatus.TOO_MANY_REQUESTS).set('Retry-After', '60').json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      error: 'Too Many Requests',
      message:
        'You have made too many requests. Please wait before trying again.',
      retryAfter: 60,
    });
  }
}
