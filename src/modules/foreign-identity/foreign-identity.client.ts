/**
 * Foreign identity HTTP client for api/auth.
 * The client is intentionally tiny: auth only needs read access by FIN
 * during registration, and every request uses the same NIDA-style Basic
 * Auth pattern as the citizen API.
 */
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ForeignIdentityProfile } from './foreign-identity-profile.interface';

@Injectable()
export class ForeignIdentityClient {
  private readonly logger = new Logger(ForeignIdentityClient.name);
  private readonly baseUrl: string;
  private readonly basicAuthHeader: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = (
      this.config.get<string>('FOREIGN_IDENTITY_SERVICE_URL') ??
      'http://localhost:3006/api/v1'
    ).replace(/\/+$/, '');

    const username = this.config.get<string>(
      'FOREIGN_IDENTITY_SERVICE_USERNAME',
    );
    const password = this.config.get<string>(
      'FOREIGN_IDENTITY_SERVICE_PASSWORD',
    );

    if (!username || !password) {
      throw new Error(
        'FOREIGN_IDENTITY_SERVICE_USERNAME and FOREIGN_IDENTITY_SERVICE_PASSWORD environment variables must be set',
      );
    }

    const credentials = Buffer.from(`${username}:${password}`).toString(
      'base64',
    );
    this.basicAuthHeader = `Basic ${credentials}`;
  }

  /**
   * Fetches one foreign identity profile by its FIN.
   *
   * Returns `null` when the foreign-identity service reports 404 so the
   * caller can translate that into the platform's registration message.
   * All auth/service-side failures throw because they indicate a broken
   * internal dependency, not a user-input problem.
   */
  async getByFin(fin: string): Promise<ForeignIdentityProfile | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<ForeignIdentityProfile>(
          `${this.baseUrl}/foreign-identities/${encodeURIComponent(fin)}`,
          {
            headers: {
              Authorization: this.basicAuthHeader,
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;

        if (status === 404) {
          return null;
        }

        this.logger.error(
          `Foreign identity lookup failed for fin=${fin} status=${status ?? 'network'}`,
          error,
        );

        throw new InternalServerErrorException(
          'Foreign identity lookup failed. Please retry.',
        );
      }

      this.logger.error(
        `Foreign identity lookup crashed for fin=${fin}`,
        error,
      );
      throw new InternalServerErrorException(
        'Foreign identity lookup failed. Please retry.',
      );
    }
  }
}
