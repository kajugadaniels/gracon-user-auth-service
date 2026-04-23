import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum AppEnv {
  Development = 'development',
  Production = 'production',
}

/**
 * Declares every environment variable the API needs.
 * ConfigModule runs this at startup — if any required var is missing or invalid,
 * the process exits immediately with a clear error message listing every problem.
 */
class EnvironmentVariables {
  // ─── App ───────────────────────────────────────────────────────────────────
  @IsEnum(AppEnv, { message: 'APP_ENV must be "development" or "production"' })
  APP_ENV: AppEnv = AppEnv.Development;

  @IsInt({ message: 'APP_PORT must be an integer' })
  @Min(1, { message: 'APP_PORT must be at least 1' })
  APP_PORT: number = 3000;

  // ─── Database ──────────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL is required' })
  DATABASE_URL!: string;

  // ─── JWT ───────────────────────────────────────────────────────────────────
  @IsString()
  @MinLength(32, {
    message:
      'JWT_SECRET must be at least 32 characters. ' +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
  })
  JWT_SECRET!: string;

  // ─── Encryption ────────────────────────────────────────────────────────────
  @IsString()
  @Length(32, 32, {
    message: 'ENCRYPTION_SECRET must be exactly 32 characters (AES-256 key)',
  })
  ENCRYPTION_SECRET!: string;

  // ─── Citizen API ───────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty({ message: 'CITIZEN_API_URL is required' })
  CITIZEN_API_URL!: string;

  @IsString()
  @IsNotEmpty({ message: 'CITIZEN_API_USERNAME is required' })
  CITIZEN_API_USERNAME!: string;

  @IsString()
  @IsNotEmpty({ message: 'CITIZEN_API_PASSWORD is required' })
  CITIZEN_API_PASSWORD!: string;

  // ─── Foreign Identity Service ─────────────────────────────────────────────
  @IsString()
  @IsNotEmpty({
    message:
      'FOREIGN_IDENTITY_SERVICE_URL is required (URL of the foreign identity API)',
  })
  FOREIGN_IDENTITY_SERVICE_URL: string = 'http://localhost:3006/api/v1';

  @IsString()
  @IsNotEmpty({
    message:
      'FOREIGN_IDENTITY_SERVICE_USERNAME is required (Basic Auth username for internal foreign identity lookups)',
  })
  FOREIGN_IDENTITY_SERVICE_USERNAME!: string;

  @IsString()
  @IsNotEmpty({
    message:
      'FOREIGN_IDENTITY_SERVICE_PASSWORD is required (Basic Auth password for internal foreign identity lookups)',
  })
  FOREIGN_IDENTITY_SERVICE_PASSWORD!: string;

  // ─── Mailer ────────────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty({ message: 'MAIL_HOST is required' })
  MAIL_HOST!: string;

  @IsInt({ message: 'MAIL_PORT must be an integer' })
  @Min(1, { message: 'MAIL_PORT must be at least 1' })
  MAIL_PORT!: number;

  @IsString()
  @IsNotEmpty({ message: 'MAIL_USER is required' })
  MAIL_USER!: string;

  @IsString()
  @IsNotEmpty({ message: 'MAIL_PASS is required' })
  MAIL_PASS!: string;

  @IsString()
  @IsNotEmpty({ message: 'MAIL_FROM is required' })
  MAIL_FROM!: string;

  // ─── Frontend ──────────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty({
    message: 'FRONTEND_URL is required (used in verification email links)',
  })
  FRONTEND_URL!: string;

  // ─── AWS ───────────────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty({ message: 'AWS_REGION is required' })
  AWS_REGION!: string;

  @IsString()
  @IsNotEmpty({ message: 'AWS_ACCESS_KEY_ID is required' })
  AWS_ACCESS_KEY_ID!: string;

  @IsString()
  @IsNotEmpty({ message: 'AWS_SECRET_ACCESS_KEY is required' })
  AWS_SECRET_ACCESS_KEY!: string;

  @IsString()
  @IsNotEmpty({ message: 'AWS_S3_BUCKET_NAME is required' })
  AWS_S3_BUCKET_NAME!: string;

  // ─── Engine ────────────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty({
    message: 'ENGINE_URL is required (URL of the FastAPI verification engine)',
  })
  ENGINE_URL!: string;

  @IsString()
  @IsNotEmpty({
    message:
      'ENGINE_API_KEY is required (must match the engine ENGINE_API_KEY)',
  })
  ENGINE_API_KEY!: string;
}

/**
 * Called by ConfigModule.forRoot({ validate }).
 * Throws with a full list of problems so you can fix all issues in one shot.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true, // converts "3000" → 3000 for @IsInt fields
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .flatMap((e) => Object.values(e.constraints ?? {}))
      .map((msg) => `  • ${msg}`)
      .join('\n');

    throw new Error(
      `\n\n🔴  Environment validation failed — fix these before starting:\n\n${messages}\n`,
    );
  }

  return validated;
}
