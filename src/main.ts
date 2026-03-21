import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('APP_PORT', 3000);
  const env = configService.get<string>('APP_ENV', 'development');
  const isProduction = configService.get<string>('APP_ENV') === 'production';

  // Global prefix — all routes are under /api/v1/
  app.setGlobalPrefix('api/v1');

  // Global validation pipe — validates and transforms all DTOs automatically
  // whitelist: strips fields not in the DTO (rejects unexpected input)
  // forbidNonWhitelisted: throws 400 if unknown fields are sent
  // transform: auto-converts payloads to DTO class instances
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter — converts ThrottlerException to clean JSON
  app.useGlobalFilters(new ThrottlerExceptionFilter());

  // CORS — only allow requests from our frontend URL
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL'),
    credentials: true,
  });

  await app.listen(port);
  console.log(
    `[${env.toUpperCase()}] Gateway running on http://localhost:${port}/api/v1`,
  );

  if (!isProduction) {
    console.log(`\n🚀  Gateway running on http://localhost:${port}/api/v1`);
    console.log(`📖  Swagger UI    →  http://localhost:${port}/docs`);
    console.log(`📄  ReDoc         →  http://localhost:${port}/docs/redoc`);
    console.log(`📋  OpenAPI JSON  →  http://localhost:${port}/docs-json\n`);
  } else {
    console.log(`Gateway running on port ${port} [production]`);
  }
}

bootstrap();
