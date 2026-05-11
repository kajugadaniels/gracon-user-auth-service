import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CitizenModule } from '../citizen/citizen.module';
import { ForeignIdentityModule } from '../foreign-identity/foreign-identity.module';

@Module({
  imports: [
    CitizenModule, // provides CitizenService for NID lookup during registration
    ForeignIdentityModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '15m',
          issuer: 'id-verification-gateway',
          audience: 'id-verification-client',
        },
      }),
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // exported for AuthModule to use findByEmail and findById
})
export class UsersModule {}
