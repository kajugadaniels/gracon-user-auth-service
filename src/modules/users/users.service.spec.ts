/**
 * Users service registration tests.
 * These cover the FIN-based registration branch introduced for foreign
 * identity users while keeping the existing NID flow isolated.
 */
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IdentityType } from '@gracon/database';
import { UsersService } from './users.service';
import { RegisterDto } from './dto/register.dto';

interface ForeignIdentityProfile {
  fin: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  countryOfOrigin: string;
  nationality: string;
  maritalStatus: string;
  issuanceVersion: number;
  isActive: boolean;
}

function buildRegisterDto(overrides: Partial<RegisterDto> = {}): RegisterDto {
  return {
    email: 'foreign.user@example.com',
    password: 'Secure@2024!',
    fin: '2199170000047067',
    ...overrides,
  };
}

describe('UsersService.register', () => {
  const foreignIdentity: ForeignIdentityProfile = {
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

  function createService() {
    const tx = {
      user: {
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'foreign.user@example.com',
        }),
      },
      citizenIdentity: {
        create: jest.fn().mockResolvedValue({ id: 'identity-1' }),
      },
      platformId: {
        create: jest.fn().mockResolvedValue({ id: 'pid-1' }),
      },
      emailVerificationToken: {
        create: jest.fn().mockResolvedValue({ id: 'token-1' }),
      },
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      citizenIdentity: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(
        async (
          callback: (transactionClient: typeof tx) => Promise<{
            id: string;
            email: string;
          }>,
        ) => callback(tx),
      ),
    };

    const encryption = {
      hash: jest.fn((value: string) => `hash:${value}`),
      encrypt: jest.fn((value: string) => `enc:${value}`),
      decrypt: jest.fn(),
      compareHash: jest.fn(),
    };

    const s3 = {
      deleteObject: jest.fn(),
      uploadProfileImage: jest.fn(),
      getPresignedUrl: jest.fn(),
    };

    const pidService = {
      generate: jest.fn().mockReturnValue('19910384721'),
    };

    const citizenService = {
      lookupCitizen: jest.fn(),
    };

    const foreignIdentityClient = {
      getByFin: jest.fn().mockResolvedValue(foreignIdentity),
    };

    const mailer = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendWelcomeEmail: jest.fn(),
    };

    const secEvent = {
      logPasswordChanged: jest.fn(),
    };

    const service = new UsersService(
      prisma as never,
      encryption as never,
      s3 as never,
      pidService as never,
      citizenService as never,
      foreignIdentityClient as never,
      mailer as never,
      secEvent as never,
    );

    return {
      service,
      prisma,
      tx,
      encryption,
      pidService,
      citizenService,
      foreignIdentityClient,
      mailer,
    };
  }

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('registers a FIN-backed user and marks the account ID-verified immediately', async () => {
    const { service, tx, citizenService, foreignIdentityClient, mailer } =
      createService();

    const result = await service.register(buildRegisterDto());

    expect(citizenService.lookupCitizen).not.toHaveBeenCalled();
    expect(foreignIdentityClient.getByFin).toHaveBeenCalledWith(
      foreignIdentity.fin,
    );
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'foreign.user@example.com',
        isVerified: false,
        isActive: false,
        isIdVerified: true,
        idVerifiedAt: expect.any(Date),
      }),
      select: { id: true, email: true },
    });
    expect(tx.citizenIdentity.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        identityType: IdentityType.FIN,
        nidEncrypted: null,
        nidHash: null,
        finEncrypted: `enc:${foreignIdentity.fin}`,
        finHash: `hash:${foreignIdentity.fin}`,
        surName: foreignIdentity.lastName,
        postNames: foreignIdentity.firstName,
        sex: foreignIdentity.gender,
        dateOfBirth: new Date(foreignIdentity.dateOfBirth),
        countryOfBirth: foreignIdentity.countryOfOrigin,
      },
    });
    expect(mailer.sendVerificationEmail).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      message:
        'Registration successful. Please check your email to verify your account.',
      data: {
        userId: 'user-1',
        email: 'foreign.user@example.com',
        surName: foreignIdentity.lastName,
        postNames: foreignIdentity.firstName,
        platformId: '19910384721',
        identityType: IdentityType.FIN,
        fin: foreignIdentity.fin,
      },
    });
  });

  it('returns 404 when the FIN is not registered', async () => {
    const { service, foreignIdentityClient, citizenService } = createService();
    foreignIdentityClient.getByFin.mockResolvedValue(null);

    await expect(service.register(buildRegisterDto())).rejects.toThrow(
      new NotFoundException(
        'The provided Foreign Identity Number is not registered or has been deactivated. Contact a platform administrator.',
      ),
    );
    expect(citizenService.lookupCitizen).not.toHaveBeenCalled();
  });

  it('returns 404 when the FIN has been deactivated', async () => {
    const { service, foreignIdentityClient } = createService();
    foreignIdentityClient.getByFin.mockResolvedValue({
      ...foreignIdentity,
      isActive: false,
    });

    await expect(service.register(buildRegisterDto())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns 409 when the FIN is already linked to another user', async () => {
    const { service, prisma } = createService();
    prisma.citizenIdentity.findFirst.mockResolvedValue({ id: 'existing-user' });

    await expect(service.register(buildRegisterDto())).rejects.toThrow(
      new ConflictException(
        'An account with this Foreign Identity Number is already registered',
      ),
    );
  });

  it('returns 400 when both documentNumber and fin are supplied', async () => {
    const { service, citizenService, foreignIdentityClient } = createService();

    await expect(
      service.register(
        buildRegisterDto({ documentNumber: '1199880012345678' }),
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Provide either documentNumber or fin, not both in the same request.',
      ),
    );
    expect(citizenService.lookupCitizen).not.toHaveBeenCalled();
    expect(foreignIdentityClient.getByFin).not.toHaveBeenCalled();
  });

  it('returns 400 when neither documentNumber nor fin is supplied', async () => {
    const { service, citizenService, foreignIdentityClient } = createService();

    await expect(
      service.register(buildRegisterDto({ fin: undefined })),
    ).rejects.toThrow(
      new BadRequestException(
        'Either documentNumber or fin must be provided for registration.',
      ),
    );
    expect(citizenService.lookupCitizen).not.toHaveBeenCalled();
    expect(foreignIdentityClient.getByFin).not.toHaveBeenCalled();
  });
});
