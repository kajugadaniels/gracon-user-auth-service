// Basic-auth middleware protecting /docs and /redoc in production.
// API documentation must never be publicly accessible — it reveals
// endpoint structure, authentication flows, and data shapes that
// would give an attacker a significant advantage.
//
// In production, set DOCS_BASIC_AUTH_USER and DOCS_BASIC_AUTH_PASS
// in .env. Access the docs at /docs with those credentials.
import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class DocsAuthMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const user = this.config.get<string>('DOCS_BASIC_AUTH_USER');
    const pass = this.config.get<string>('DOCS_BASIC_AUTH_PASS');

    // If credentials are not configured, block access entirely.
    // Fail closed — no credentials = no access, never open access.
    if (!user || !pass) {
      res.status(503).json({
        statusCode: 503,
        message: 'API documentation is not available.',
      });
      return;
    }

    const authHeader = req.headers['authorization'] ?? '';

    if (!authHeader.startsWith('Basic ')) {
      // No credentials provided — send WWW-Authenticate to trigger
      // the browser's native basic-auth dialog
      res
        .set('WWW-Authenticate', 'Basic realm="API Documentation"')
        .status(401)
        .json({
          statusCode: 401,
          message: 'Authentication required to access API documentation.',
        });
      return;
    }

    // Decode the base64 credentials from the Authorization header
    const encoded = authHeader.slice('Basic '.length);
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [reqUser, reqPass] = decoded.split(':');

    // Constant-time comparison — prevents timing attacks that could
    // be used to guess the username or password character by character
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const userMatch = crypto.timingSafeEqual(
      Buffer.from(reqUser ?? ''),
      Buffer.from(user),
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const passMatch = crypto.timingSafeEqual(
      Buffer.from(reqPass ?? ''),
      Buffer.from(pass),
    );

    if (!userMatch || !passMatch) {
      res
        .set('WWW-Authenticate', 'Basic realm="API Documentation"')
        .status(401)
        .json({
          statusCode: 401,
          message: 'Invalid credentials.',
        });
      return;
    }

    // Credentials valid — allow through to Swagger
    next();
  }
}
