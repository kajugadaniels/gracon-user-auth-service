import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Get config service to read .env values
  const configService = app.get(ConfigService);
  const port = configService.get<number>('APP_PORT', 3000);

  // Global prefix — all routes will be /api/v1/...
  app.setGlobalPrefix('api/v1');

  // Global validation pipe — automatically validates all DTOs
  // whitelist: strips any fields not defined in the DTO (security)
  // forbidNonWhitelisted: throws error if unknown fields are sent
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true, // auto-transform payloads to DTO class instances
    }),
  );

  // Enable CORS — only allow requests from our frontend
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL'),
    credentials: true,
  });

  await app.listen(port);
  console.log(`Gateway running on http://localhost:${port}/api/v1`);
}

bootstrap();
