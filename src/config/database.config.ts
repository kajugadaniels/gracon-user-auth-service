import { registerAs } from '@nestjs/config';

// Registers database config as a namespaced config object
// Access anywhere with configService.get('database')
export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Neon Postgres
}));
