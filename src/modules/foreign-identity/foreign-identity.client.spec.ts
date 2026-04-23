/**
 * Foreign identity client tests.
 * The client only needs one read path, so the tests focus on status-code
 * translation rather than Nest module bootstrapping.
 */
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { of, throwError } from 'rxjs';
import { ForeignIdentityClient } from './foreign-identity.client';
import { ForeignIdentityProfile } from './foreign-identity-profile.interface';

function buildAxiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  };
}

function buildAxiosError(status: number): AxiosError {
  return new AxiosError(
    `Request failed with status ${status}`,
    undefined,
    {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
    undefined,
    {
      data: {},
      status,
      statusText: String(status),
      headers: {},
      config: {
        headers: new AxiosHeaders(),
      } as InternalAxiosRequestConfig,
    },
  );
}

describe('ForeignIdentityClient', () => {
  const profile: ForeignIdentityProfile = {
    fin: '2199170000047067',
    firstName: 'Patrick',
    lastName: 'Ishimwe',
    gender: 'MALE',
    dateOfBirth: '1991-04-15T00:00:00.000Z',
    countryOfOrigin: 'KE',
    nationality: 'Kenyan',
    maritalStatus: 'SINGLE',
    issuanceVersion: 0,
    isActive: true,
  };

  function createClient(
    httpService: Pick<HttpService, 'get'>,
  ): ForeignIdentityClient {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'FOREIGN_IDENTITY_SERVICE_URL') {
          return 'http://localhost:3006/api/v1';
        }

        if (key === 'FOREIGN_IDENTITY_SERVICE_TOKEN') {
          return 'service-admin-token';
        }

        return undefined;
      }),
    } as Pick<ConfigService, 'get'>;

    return new ForeignIdentityClient(
      httpService as HttpService,
      config as ConfigService,
    );
  }

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('returns the foreign identity profile on 200', async () => {
    const httpService = {
      get: jest.fn().mockReturnValue(of(buildAxiosResponse(profile))),
    };
    const client = createClient(httpService);

    await expect(client.getByFin(profile.fin)).resolves.toEqual(profile);
  });

  it('returns null on 404', async () => {
    const httpService = {
      get: jest.fn().mockReturnValue(throwError(() => buildAxiosError(404))),
    };
    const client = createClient(httpService);

    await expect(client.getByFin(profile.fin)).resolves.toBeNull();
  });

  it.each([401, 403, 500])(
    'throws on %s responses from the foreign identity service',
    async (status) => {
      const httpService = {
        get: jest
          .fn()
          .mockReturnValue(throwError(() => buildAxiosError(status))),
      };
      const client = createClient(httpService);

      await expect(client.getByFin(profile.fin)).rejects.toThrow(
        InternalServerErrorException,
      );
    },
  );
});
