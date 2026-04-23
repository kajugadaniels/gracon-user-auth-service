/**
 * Verification service tests.
 * These confirm that FIN-backed users are blocked from biometric
 * verification before any storage or engine work begins.
 */
import { BadRequestException } from '@nestjs/common';
import { IdentityType } from '@prisma/client';
import { VerificationService } from './verification.service';

describe('VerificationService.submitVerification', () => {
  function createService() {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          isVerified: true,
          isActive: true,
          isIdVerified: true,
          verificationAttempts: 0,
          citizenIdentity: {
            identityType: IdentityType.FIN,
            nidEncrypted: null,
            surName: 'ISHIMWE',
            postNames: 'Patrick',
            dateOfBirth: new Date('1991-04-15T00:00:00.000Z'),
          },
        }),
      },
      idVerification: {
        findMany: jest.fn(),
      },
    };

    const encryption = {
      decrypt: jest.fn(),
    };

    const s3 = {
      uploadVerificationImage: jest.fn(),
      deleteObject: jest.fn(),
    };

    const httpService = {
      post: jest.fn(),
    };

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'ENGINE_URL') {
          return 'http://localhost:8000';
        }

        if (key === 'ENGINE_API_KEY') {
          return 'engine-key';
        }

        return undefined;
      }),
    };

    const authService = {
      upgradeToken: jest.fn(),
    };

    const secEvent = {
      logVerificationPassed: jest.fn(),
      logVerificationFailed: jest.fn(),
    };

    const service = new VerificationService(
      prisma as never,
      encryption as never,
      s3 as never,
      httpService as never,
      config as never,
      authService as never,
      secEvent as never,
    );

    return { service, s3, authService };
  }

  it('rejects biometric verification for FIN-backed users', async () => {
    const { service, s3, authService } = createService();

    const fakeFile = {
      buffer: Buffer.from('image'),
      originalname: 'image.jpg',
      mimetype: 'image/jpeg',
      size: 5,
    } as Express.Multer.File;

    await expect(
      service.submitVerification(
        'user-1',
        '1199880012345678',
        fakeFile,
        fakeFile,
        '127.0.0.1',
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Biometric verification is not required for foreign identity users.',
      ),
    );
    expect(s3.uploadVerificationImage).not.toHaveBeenCalled();
    expect(authService.upgradeToken).not.toHaveBeenCalled();
  });
});
