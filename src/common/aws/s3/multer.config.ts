import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import * as multer from 'multer';

// Max sizes per upload context
const VERIFICATION_IMAGE_MAX_MB = 5;
const PROFILE_IMAGE_MAX_MB = 3;

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/**
 * Multer configuration for verification images (ID card + selfie).
 * Stores in memory — never written to disk.
 * Files are passed directly to S3 as a Buffer.
 */
export const verificationUploadConfig: MulterOptions = {
  storage: multer.memoryStorage(), // buffer only — no disk writes
  limits: {
    fileSize: VERIFICATION_IMAGE_MAX_MB * 1024 * 1024,
    files: 2, // ID card + selfie — no more
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(
        new BadRequestException(
          `Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP`,
        ),
        false,
      );
    }
    callback(null, true);
  },
};

/**
 * Multer configuration for profile image uploads.
 * Slightly stricter size limit than verification images.
 */
export const profileUploadConfig: MulterOptions = {
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PROFILE_IMAGE_MAX_MB * 1024 * 1024,
    files: 1, // one profile photo at a time
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(
        new BadRequestException(
          `Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP`,
        ),
        false,
      );
    }
    callback(null, true);
  },
};
