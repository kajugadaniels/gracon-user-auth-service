import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CitizenModule } from '../citizen/citizen.module';
import { ForeignIdentityModule } from '../foreign-identity/foreign-identity.module';

@Module({
  imports: [
    CitizenModule, // provides CitizenService for NID lookup during registration
    ForeignIdentityModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // exported for AuthModule to use findByEmail and findById
})
export class UsersModule {}
