/**
 * Global Prisma exception filter.
 *
 * Intercepts every error class thrown by the Prisma client and maps it to a
 * safe HTTP response before it can bubble up to NestJS's default handler.
 *
 * Security concern: Prisma error objects contain `meta` fields that expose
 * table names (`modelName`), column names (`target`), foreign-key field names
 * (`field_name`), and constraint names (`constraint`). If these reach the HTTP
 * response they give an attacker a free schema map. This filter logs the full
 * Prisma error server-side and returns only a sanitised envelope.
 *
 * Handled error classes (all are non-HttpException, so they bypass the HTTP
 * exception filter and would otherwise fall to the catch-all 500):
 *   PrismaClientKnownRequestError   — query-level constraint/not-found errors
 *   PrismaClientUnknownRequestError — unrecognised DB error
 *   PrismaClientRustPanicError      — internal engine panic
 *   PrismaClientInitializationError — connection / datasource errors
 *   PrismaClientValidationError     — invalid query structure (internal bug)
 */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

// Convenience aliases — the error classes live inside the Prisma namespace,
// not as top-level exports, which is why direct named imports fail under
// nodenext module resolution.
type PrismaClientKnownRequestError = Prisma.PrismaClientKnownRequestError;
type PrismaClientUnknownRequestError = Prisma.PrismaClientUnknownRequestError;
type PrismaClientRustPanicError = Prisma.PrismaClientRustPanicError;
type PrismaClientInitializationError = Prisma.PrismaClientInitializationError;
type PrismaClientValidationError = Prisma.PrismaClientValidationError;

type AnyPrismaError =
  | PrismaClientKnownRequestError
  | PrismaClientUnknownRequestError
  | PrismaClientRustPanicError
  | PrismaClientInitializationError
  | PrismaClientValidationError;

/**
 * Maps Prisma P-codes to { status, message } pairs.
 * Only the message reaches the client — the Prisma error (with meta) is
 * logged separately.
 */
const KNOWN_CODE_MAP: Record<string, { status: number; message: string }> = {
  // Unique constraint violated — a record with this value already exists
  P2002: {
    status: HttpStatus.CONFLICT,
    message: 'A record with the provided value already exists.',
  },
  // Foreign-key constraint — the referenced record does not exist
  P2003: {
    status: HttpStatus.CONFLICT,
    message: 'The related record referenced by this request was not found.',
  },
  // Relation constraint — deleting/connecting would violate referential integrity
  P2014: {
    status: HttpStatus.CONFLICT,
    message:
      'This operation would violate a data integrity constraint. ' +
      'Ensure all related records exist before retrying.',
  },
  // Required field is null in the DB — indicates an internal data inconsistency
  P2011: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'An unexpected data error occurred. Please try again later.',
  },
  // Record not found during an update or delete operation
  P2025: {
    status: HttpStatus.NOT_FOUND,
    message: 'The requested record was not found.',
  },
};

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientRustPanicError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientValidationError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: AnyPrismaError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, message } = this.resolve(exception);

    // Log the full Prisma error including meta (table/column/constraint names)
    // so engineers can debug — none of this leaves the server.
    const detail =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? `code=${exception.code} meta=${JSON.stringify(exception.meta)}`
        : exception instanceof Error
          ? exception.message
          : String(exception);

    this.logger.error(
      `Prisma ${exception.constructor.name} — ${req.method} ${req.path}`,
      detail,
    );

    res.status(status).json({
      statusCode: status,
      error: this.statusLabel(status),
      message,
    });
  }

  /**
   * Maps a Prisma exception to a safe { status, message } pair.
   * Never includes anything from exception.meta.
   */
  private resolve(exception: AnyPrismaError): {
    status: number;
    message: string;
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return (
        KNOWN_CODE_MAP[exception.code] ?? {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'A database error occurred. Please try again later.',
        }
      );
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      // Connection failure — DB is down or misconfigured.
      // Return 503 so upstream load balancers and health checks handle it correctly.
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          'The service is temporarily unavailable. Please try again shortly.',
      };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // This means application code sent a malformed Prisma query — it is an
      // internal bug, not a client error. Return a generic 500.
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred. Please try again later.',
      };
    }

    // PrismaClientUnknownRequestError and PrismaClientRustPanicError both
    // indicate an unrecoverable internal failure.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred. Please try again later.',
    };
  }

  private statusLabel(status: number): string {
    const labels: Record<number, string> = {
      400: 'Bad Request',
      404: 'Not Found',
      409: 'Conflict',
      500: 'Internal Server Error',
      503: 'Service Unavailable',
    };
    return labels[status] ?? 'Error';
  }
}
