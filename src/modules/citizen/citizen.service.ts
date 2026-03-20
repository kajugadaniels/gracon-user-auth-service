import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import type { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { firstValueFrom, TimeoutError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { AxiosError } from 'axios';
import {
  CitizenApiRawResponse,
  CitizenData,
} from './interfaces/citizen-api-response.interface';
import {
  CitizenNotFoundException,
  CitizenApiUnavailableException,
  CitizenApiTimeoutException,
  InvalidDocumentException,
} from './exceptions/citizen-api.exception';

@Injectable()
export class CitizenService {
  // Logger scoped to CitizenService — shows class name in log output
  private readonly logger = new Logger(CitizenService.name);

  // Fixed values from the API spec — these never change
  private readonly DOCUMENT_TYPE = 'NID';
  private readonly FOSAID = '0022';

  // Cache TTL — how long a successful NID lookup is cached (5 minutes)
  // Prevents hammering the external API for the same NID repeatedly
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  // Request timeout — how long we wait before giving up on the external API
  private readonly REQUEST_TIMEOUT_MS = 10_000; // 10 seconds

  // NID must be exactly 16 digits — validated before any API call
  private readonly NID_REGEX = /^\d{16}$/;

  private readonly apiUrl: string;
  private readonly basicAuthHeader: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    const apiUrl = this.configService.get<string>('CITIZEN_API_URL');
    if (!apiUrl) {
      throw new Error('CITIZEN_API_URL environment variable is not set');
    }
    this.apiUrl = apiUrl;

    // Build Basic Auth header once at startup — base64("username:password")
    // Never logged, never sent to the client, never stored in DB
    const username = this.configService.get<string>('CITIZEN_API_USERNAME');
    const password = this.configService.get<string>('CITIZEN_API_PASSWORD');
    const credentials = Buffer.from(`${username}:${password}`).toString(
      'base64',
    );
    this.basicAuthHeader = `Basic ${credentials}`;
  }

  // ─── Public method ────────────────────────────────────────────────────────

  // Main entry point — validates, checks cache, calls API, returns clean data
  async lookupCitizen(documentNumber: string): Promise<CitizenData> {
    // Step 1 — validate format before making any network call
    this.validateDocumentNumber(documentNumber);

    // Step 2 — check cache first (avoids external API call for repeated lookups)
    const cacheKey = this.buildCacheKey(documentNumber);
    const cached = await this.cacheManager.get<CitizenData>(cacheKey);

    if (cached) {
      this.logger.log(
        `Cache hit for document ending ...${documentNumber.slice(-4)}`,
      );
      return cached;
    }

    // Step 3 — cache miss, call the external API
    this.logger.log(
      `Cache miss — calling citizen API for document ending ...${documentNumber.slice(-4)}`,
    );
    const citizenData = await this.callCitizenApi(documentNumber);

    // Step 4 — store result in cache for future requests
    await this.cacheManager.set(cacheKey, citizenData, this.CACHE_TTL_MS);

    return citizenData;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  // Validates NID format — 16 digits, no letters, no spaces
  private validateDocumentNumber(documentNumber: string): void {
    if (!documentNumber || !this.NID_REGEX.test(documentNumber.trim())) {
      throw new InvalidDocumentException();
    }
  }

  // Cache key — hashed so the raw NID number is never stored as a cache key
  // An attacker reading memory/cache logs sees a hash, not an NID
  private buildCacheKey(documentNumber: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const hash = crypto
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .createHash('sha256')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .update(documentNumber)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .digest('hex');
    return `citizen:${hash}`;
  }

  // Makes the actual HTTP request to the national ID API
  private async callCitizenApi(documentNumber: string): Promise<CitizenData> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .post<CitizenApiRawResponse>(
            this.apiUrl,
            {
              documentType: this.DOCUMENT_TYPE, // always "NID"
              documentNumber: documentNumber.trim(),
              fosaid: this.FOSAID, // always "0022"
            },
            {
              headers: {
                Authorization: this.basicAuthHeader, // Basic auth — server-side only
                'Content-Type': 'application/json',
              },
            },
          )
          .pipe(
            // Abort the request if it takes longer than REQUEST_TIMEOUT_MS
            timeout(this.REQUEST_TIMEOUT_MS),
            catchError((error) => {
              throw error; // re-throw so our catch block handles it
            }),
          ),
      );

      // Validate the API returned a successful status
      if (response.data?.status !== 'ok' || !response.data?.data) {
        throw new CitizenNotFoundException(documentNumber);
      }

      // Extract only the 8 fields we need — ignore everything else
      return this.extractCitizenData(response.data.data);
    } catch (error) {
      this.handleApiError(error, documentNumber);
    }
  }

  // Extracts and transforms only the fields we need from the raw API response
  private extractCitizenData(raw: CitizenApiRawResponse['data']): CitizenData {
    return {
      documentType: raw.documentType,
      nid: raw.nid,
      surName: raw.surName,
      postNames: raw.postNames,
      sex: raw.sex,
      dateOfBirth: this.parseDateOfBirth(raw.dateOfBirth), // "DD/MM/YYYY" → Date
      countryOfBirth: raw.countryOfBirth,
    };
  }

  // Parses "DD/MM/YYYY" date format from the citizen API into a JS Date object
  private parseDateOfBirth(dateString: string): Date {
    const [day, month, year] = dateString.split('/').map(Number);

    // Month is 0-indexed in JS Date constructor
    const date = new Date(year, month - 1, day);

    if (isNaN(date.getTime())) {
      this.logger.warn(`Failed to parse date of birth: ${dateString}`);
      throw new InvalidDocumentException();
    }

    return date;
  }

  // Central error handler — maps different error types to our custom exceptions
  private handleApiError(error: unknown, documentNumber: string): never {
    // Timeout from rxjs timeout() operator
    if (error instanceof TimeoutError) {
      this.logger.warn(
        `Citizen API timed out for document ending ...${documentNumber.slice(-4)}`,
      );
      throw new CitizenApiTimeoutException();
    }

    // Axios HTTP errors (4xx, 5xx from the external API)
    if (error instanceof AxiosError) {
      const status = error.response?.status;

      if (status === 404 || status === 400) {
        throw new CitizenNotFoundException(documentNumber);
      }

      if (status === 401 || status === 403) {
        // Auth failure — log as error (our credentials may be wrong/expired)
        this.logger.error(
          'Citizen API authentication failed — check CITIZEN_API_USERNAME and CITIZEN_API_PASSWORD in .env',
        );
        throw new CitizenApiUnavailableException();
      }

      // 5xx — external service is down
      this.logger.error(`Citizen API returned ${status}: ${error.message}`);
      throw new CitizenApiUnavailableException();
    }

    // Connection refused, DNS failure, network unreachable
    if (error?.['code'] === 'ECONNREFUSED' || error?.['code'] === 'ENOTFOUND') {
      this.logger.error(`Citizen API unreachable: ${error['code']}`);
      throw new CitizenApiUnavailableException();
    }

    // Re-throw our own custom exceptions untouched
    if (
      error instanceof CitizenNotFoundException ||
      error instanceof CitizenApiUnavailableException ||
      error instanceof CitizenApiTimeoutException ||
      error instanceof InvalidDocumentException
    ) {
      throw error;
    }

    // Unexpected error — log full details server-side, return safe message to client
    this.logger.error('Unexpected citizen API error', error);
    throw new CitizenApiUnavailableException();
  }
}
