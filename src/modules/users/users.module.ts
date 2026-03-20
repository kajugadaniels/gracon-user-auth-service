import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CitizenModule } from '../citizen/citizen.module';

@Module({
  imports: [
    CitizenModule, // provides CitizenService for NID lookup during registration
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // exported for AuthModule to use findByEmail and findById
})
export class UsersModule {}
