import { HttpException, HttpStatus } from '@nestjs/common';

export class VerificationAlreadyPassedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Already Verified',
        message:
          'Your identity has already been verified. You can proceed to login.',
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class TooManyVerificationAttemptsException extends HttpException {
  constructor(retryAfterHours: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Attempts',
        message: `Maximum verification attempts reached. Please try again in ${retryAfterHours} hour(s) or contact support.`,
        retryAfterHours,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class EmailNotVerifiedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Email Not Verified',
        message:
          'Please verify your email address before proceeding with ID verification.',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class EngineUnavailableException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Verification Service Unavailable',
        message:
          'The verification service is temporarily unavailable. Please try again in a few minutes.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class ImageUploadFailedException extends HttpException {
  constructor(imageType: string) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Image Upload Failed',
        message: `Failed to process your ${imageType}. Please ensure the image is clear, well-lit, and under 5MB.`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
