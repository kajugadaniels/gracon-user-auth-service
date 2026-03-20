import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from './config/database.config';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CitizenModule } from './modules/citizen/citizen.module';

@Module({
  imports: [
    // Load .env globally — isGlobal means no need to import ConfigModule again
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: '.env',
    }),

    // Connect to Neon Postgres using DATABASE_URL from .env
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        ssl: { rejectUnauthorized: false }, // Neon requires SSL
        autoLoadEntities: true, // auto-load all registered entities
        synchronize: process.env.APP_ENV === 'development', // only sync schema in dev
      }),
    }),

    // Feature modules
    UsersModule,
    AuthModule,
    CitizenModule,
  ],
})
export class AppModule {}
