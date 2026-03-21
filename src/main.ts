import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';
import { DocsAuthMiddleware } from './common/security/docs-auth.middleware';
import { buildHelmetConfig } from './common/security/helmet.config';
import { buildCorsConfig } from './common/security/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Suppress NestJS startup logs in production — keeps logs clean
    // and avoids leaking framework version info
    logger:
      process.env.APP_ENV === 'production'
        ? ['error', 'warn']
        : ['log', 'debug', 'error', 'verbose', 'warn'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('APP_PORT', 3000);
  const env = config.get<string>('APP_ENV', 'development');
  const frontendUrl = config.get<string>(
    'FRONTEND_URL',
    'http://localhost:4000',
  );
  const isProd = env === 'production';

  // ── Security headers ────────────────────────────────────────────
  // Helmet must be the first middleware applied — it sets headers
  // on every response before any route logic runs.
  // Headers are stricter in production than development.
  app.use(helmet(buildHelmetConfig(env)));

  // ── CORS ────────────────────────────────────────────────────────
  // Only our frontend origin is allowed.
  // Credentials (session cookie) are permitted.
  app.enableCors(buildCorsConfig(frontendUrl));

  // ── Global prefix ───────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Global validation pipe ──────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields
      forbidNonWhitelisted: true, // throw 400 on unknown fields
      transform: true, // auto-cast to DTO types
    }),
  );

  // ── Global exception filters ────────────────────────────────────
  app.useGlobalFilters(new ThrottlerExceptionFilter());

  // ── API Documentation (Swagger) ─────────────────────────────────
  // Always available in development — open on localhost with no auth.
  // In production: protected by basic-auth middleware.
  // The docs reveal endpoint structure and auth flows — never
  // expose them publicly in production.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ID Verification Platform — API')
    .setDescription(
      'Internal REST API for the ID Verification Platform. ' +
        'Handles authentication, user management, national ID lookup, ' +
        'and AI-powered identity verification. ' +
        'Not for public access.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token',
        in: 'header',
      },
      'access-token', // security scheme name — referenced in @ApiBearerAuth()
    )
    .addTag('auth', 'Authentication — login, logout, token refresh')
    .addTag('password', 'Password management — forgot and reset flows')
    .addTag('users', 'User registration, profile, and account management')
    .addTag('citizen', 'National ID lookup via citizen API')
    .addTag('verification', 'AI-powered identity verification')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  if (isProd) {
    // Production — protect docs with basic auth before serving them
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const docsMiddleware = app
      .get(DocsAuthMiddleware)
      .use.bind(app.get(DocsAuthMiddleware));

    app.use(['/docs', '/docs/json', '/redoc'], docsMiddleware);
  }

  // Register Swagger regardless of environment — middleware above
  // handles access control in production
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
    customSiteTitle: 'ID Verify API',
    swaggerOptions: {
      // Persist auth token across page refreshes in Swagger UI
      persistAuthorization: true,
      // Show request duration in Swagger UI
      displayRequestDuration: true,
    },
  });

  await app.listen(port);

  // Only log the startup URL in non-production environments
  if (!isProd) {
    console.log(
      `[${env.toUpperCase()}] Gateway → http://localhost:${port}/api/v1`,
    );
    console.log(
      `[${env.toUpperCase()}] Swagger  → http://localhost:${port}/docs`,
    );
  }
}

void bootstrap();
