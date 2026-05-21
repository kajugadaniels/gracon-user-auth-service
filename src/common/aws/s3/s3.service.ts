import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';
import { extname } from 'path';

// Allowed MIME types for uploads
// Strict whitelist — anything not in this list is rejected
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

// Max file size — 5MB in bytes (Rekognition limit is also 5MB)
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export interface UploadResult {
  key: string; // S3 object key — used to reference the file
  bucket: string;
}

export interface PresignedUrlResult {
  url: string;
  expiresAt: Date;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly profileFolder: string;
  private readonly tempFolder: string;

  // Presigned URL expiry — 1 hour for profile images
  private readonly PRESIGNED_URL_EXPIRY_SECONDS = 3600;

  constructor(private readonly config: ConfigService) {
    const bucket = this.config.get<string>('AWS_S3_BUCKET_NAME');
    const region = this.config.get<string>('AWS_REGION');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    if (!bucket)
      throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
    if (!region) throw new Error('AWS_REGION environment variable is not set');
    if (!accessKeyId)
      throw new Error('AWS_ACCESS_KEY_ID environment variable is not set');
    if (!secretAccessKey)
      throw new Error('AWS_SECRET_ACCESS_KEY environment variable is not set');

    this.bucket = bucket;
    this.profileFolder = this.config.get<string>(
      'AWS_S3_PROFILE_IMAGES_FOLDER',
      'profile-images',
    );
    this.tempFolder = this.config.get<string>(
      'AWS_S3_TEMP_FOLDER',
      'verification-temp',
    );

    // Initialize S3 client once — reused across all requests
    // Credentials pulled from .env — never hardcoded
    this.client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      // Retry config — handles transient AWS errors gracefully
      maxAttempts: 3,
    });
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  /**
   * Uploads a profile image to the permanent profile-images folder.
   * File is validated for type and size before upload.
   * Returns the S3 key — stored in the users table as imageUrl key.
   */
  async uploadProfileImage(
    userId: string,
    file: Express.Multer.File,
  ): Promise<UploadResult> {
    this.validateFile(file);

    // Generate a unique, non-guessable key
    // Format: profile-images/{userId}/{randomHex}.{ext}
    const key = this.buildProfileImageKey(
      userId,

      file.mimetype as AllowedImageType,
    );

    return this.uploadToS3(key, file.buffer, file.mimetype);
  }

  /**
   * Uploads a verification image (ID card or selfie) to the temp folder.
   * These are deleted immediately after Rekognition processes them.
   * Returns the S3 key — passed to the FastAPI engine.
   */
  async uploadVerificationImage(
    userId: string,
    imageType: 'id-card' | 'selfie',
    file: Express.Multer.File,
  ): Promise<UploadResult> {
    this.validateFile(file);

    // Format: verification-temp/{userId}/{imageType}-{randomHex}.{ext}
    const key = this.buildTempImageKey(
      userId,
      imageType,

      file.mimetype as AllowedImageType,
    );

    return this.uploadToS3(key, file.buffer, file.mimetype);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  /**
   * Deletes a single object from S3.
   * Called after verification to remove temp images immediately.
   * Errors are logged but not thrown — deletion failure
   * should not break the verification response.
   */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      this.logger.log(`Deleted S3 object: ${key}`);
    } catch (error) {
      // Log but don't throw — lifecycle rule is the safety net
      this.logger.error(`Failed to delete S3 object: ${key}`, error);
    }
  }

  /**
   * Deletes multiple objects in a single S3 API call.
   * More efficient than calling deleteObject multiple times.
   * Used to delete both ID card and selfie after verification.
   */
  async deleteObjects(keys: string[]): Promise<void> {
    if (!keys.length) return;

    try {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: keys.map((key) => ({ Key: key })),
            Quiet: true, // suppress per-object success responses
          },
        }),
      );
      this.logger.log(`Deleted ${keys.length} S3 objects`);
    } catch (error) {
      this.logger.error(
        `Failed to delete S3 objects: ${keys.join(', ')}`,
        error,
      );
    }
  }

  // ─── Presigned URLs ───────────────────────────────────────────────────────

  /**
   * Generates a temporary presigned URL for a profile image.
   * URL expires after PRESIGNED_URL_EXPIRY_SECONDS (1 hour).
   * This means profile images are never directly accessible —
   * every access requires a fresh presigned URL from your API.
   */
  async getPresignedUrl(key: string): Promise<PresignedUrlResult> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, {
        expiresIn: this.PRESIGNED_URL_EXPIRY_SECONDS,
      });

      const expiresAt = new Date(
        Date.now() + this.PRESIGNED_URL_EXPIRY_SECONDS * 1000,
      );

      return { url, expiresAt };
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned URL for key: ${key}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to generate image access URL',
      );
    }
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  /**
   * Checks key exists in S3 — used to verify upload succeeded
   * before passing key to the engine.
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async uploadToS3(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<UploadResult> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // Server-side encryption — belt-and-suspenders on top of bucket default
          ServerSideEncryption: 'AES256',
          // Metadata for audit — never includes PII
          Metadata: {
            'uploaded-at': new Date().toISOString(),
          },
        }),
      );

      this.logger.log(`Uploaded to S3: ${key}`);
      return { key, bucket: this.bucket };
    } catch (error) {
      this.logger.error(`S3 upload failed for key: ${key}`, error);
      throw new InternalServerErrorException(
        'Failed to upload image. Please try again.',
      );
    }
  }

  /**
   * Validates file MIME type and size before upload.
   * Rejects files that are too large or have disallowed types.
   * Note: MIME type from Multer is based on file content, not extension.
   */
  private validateFile(file: Express.Multer.File): void {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided');
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype as AllowedImageType)) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Allowed types: JPEG, PNG, WebP`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
      );
    }
  }

  /**
   * Builds a unique, non-guessable S3 key for profile images.
   * Using randomBytes ensures keys cannot be enumerated or predicted.
   * Format: profile-images/{userId}/{32-char-hex}.{ext}
   */
  private buildProfileImageKey(
    userId: string,
    mimeType: AllowedImageType,
  ): string {
    const randomHex = randomBytes(16).toString('hex');
    const ext = this.mimeToExtension(mimeType);
    return `${this.profileFolder}/${userId}/${randomHex}.${ext}`;
  }

  /**
   * Builds a unique S3 key for temporary verification images.
   * Format: verification-temp/{userId}/{imageType}-{32-char-hex}.{ext}
   */
  private buildTempImageKey(
    userId: string,
    imageType: 'id-card' | 'selfie',
    mimeType: AllowedImageType,
  ): string {
    const randomHex = randomBytes(16).toString('hex');
    const ext = this.mimeToExtension(mimeType);
    return `${this.tempFolder}/${userId}/${imageType}-${randomHex}.${ext}`;
  }

  private mimeToExtension(mimeType: AllowedImageType): string {
    const map: Record<AllowedImageType, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return map[mimeType];
  }
}
