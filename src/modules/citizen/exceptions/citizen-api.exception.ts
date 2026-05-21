import { HttpException, HttpStatus } from '@nestjs/common';

// Custom exceptions for the citizen API — gives callers clear error context
// instead of generic 500 errors

export class CitizenNotFoundException extends HttpException {
  constructor(documentNumber: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Citizen Not Found',
        // Never expose the full NID in error messages — only last 4 digits
        message: `No citizen found for document ending in ...${documentNumber.slice(-4)}`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class CitizenApiUnavailableException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Citizen API Unavailable',
        message:
          'National ID verification service is temporarily unavailable. Please try again later.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class CitizenApiTimeoutException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.GATEWAY_TIMEOUT,
        error: 'Citizen API Timeout',
        message:
          'National ID verification service timed out. Please try again.',
      },
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }
}

export class InvalidDocumentException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Invalid Document',
        message: 'The provided National ID number is invalid.',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
