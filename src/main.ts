import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import type { Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('APP_PORT', 3000);

  // Global prefix — all routes will be /api/v1/...
  app.setGlobalPrefix('api/v1');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL'),
    credentials: true,
  });

  // ─── Swagger / OpenAPI ────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ID Verification Gateway API')
    .setDescription(
      `## Overview

The **ID Verification Gateway** is the backend API for a national identity verification platform. It handles user registration, email verification, JWT-based authentication, and biometric ID verification using facial recognition.

## Authentication

Protected endpoints use **JWT Bearer authentication**. Obtain an access token from \`POST /auth/login\` and include it in every protected request:

\`\`\`
Authorization: Bearer <accessToken>
\`\`\`

Access tokens expire in **15 minutes**. Use \`POST /auth/refresh\` with your refresh token to get a new pair before expiry.

## User Lifecycle

A new user must complete three steps before they can log in:

\`\`\`
1. Register         →  POST /users/register
2. Verify email     →  GET  /users/verify-email?userId=...&token=...
3. Verify identity  →  POST /verification/submit  (requires JWT from a partial login? No — the user cannot log in yet)
\`\`\`

> **Note:** Full login (\`POST /auth/login\`) requires all three steps to be complete. ID verification must be submitted using a separate authentication mechanism — check with the integration team for the pre-login flow.

## Error Format

All errors follow this shape:

\`\`\`json
{
  "statusCode": 400,
  "message": "Human-readable description",
  "error": "Error category"
}
\`\`\`

Validation errors return \`message\` as an array of strings.

## Rate Limiting

- **Resend verification email:** 3 requests per hour per email address
- **ID verification attempts:** 3 attempts per 24-hour window per user
`,
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
        description: 'Enter your JWT access token obtained from POST /auth/login',
      },
      'access-token',
    )
    .addTag('Citizen', 'National ID citizen lookup — used to pre-fill registration forms')
    .addTag('Users', 'Account registration and email verification')
    .addTag('Auth', 'Authentication — login, token refresh, and logout')
    .addTag('Verification', 'Biometric identity verification (face + document)')
    .setContact('API Support', '', 'support@gracon.rw')
    .setLicense('Private', '')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Swagger UI — interactive testing at /docs
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Gracon API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });

  // Expose raw OpenAPI JSON at /docs-json (consumed by ReDoc)
  // SwaggerModule.setup already serves it at /docs-json automatically

  // ReDoc reference docs — read-only, no interactive testing
  app.getHttpAdapter().get('/docs/redoc', (_req: unknown, res: Response) => {
    res.sendFile(join(process.cwd(), 'public', 'redoc.html'));
  });

  await app.listen(port);
  console.log(`\n🚀  Gateway running on http://localhost:${port}/api/v1`);
  console.log(`📖  Swagger UI    →  http://localhost:${port}/docs`);
  console.log(`📄  ReDoc         →  http://localhost:${port}/docs/redoc`);
  console.log(`📋  OpenAPI JSON  →  http://localhost:${port}/docs-json\n`);
}

bootstrap();
