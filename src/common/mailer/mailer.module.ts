import { Global, Module } from '@nestjs/common';
import { MailerModule as NestMailerModule } from '@nestjs/mailer';
import { HandlebarsAdapter } from '@nestjs/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AppMailerService } from './mailer.service';

@Global()
@Module({
  imports: [
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    NestMailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('MAIL_HOST'),
          port: config.get<number>('MAIL_PORT'),
          secure: false, // use TLS via STARTTLS (port 587)
          auth: {
            user: config.get<string>('MAIL_USER'),
            pass: config.get<string>('MAIL_PASS'), // app password from .env
          },
        },
        defaults: {
          from: config.get<string>('MAIL_FROM'),
        },
        // Handlebars templates — HTML emails with dynamic variables
        template: {
          dir: join(__dirname, 'templates'),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
  ],
  providers: [AppMailerService],
  exports: [AppMailerService],
})
export class AppMailerModule {}
