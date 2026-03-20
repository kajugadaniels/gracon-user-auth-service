import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// Handles all encryption and hashing in the app
// AES-256-CBC — used for NID and PID (reversible — we need to read them back)
// SHA-256     — used for tokens and PID lookup hash (one-way — only for comparison)
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly secretKey: Buffer;

  constructor(private configService: ConfigService) {
    const secret = this.configService.get<string>('ENCRYPTION_SECRET');

    if (!secret) {
      throw new Error('ENCRYPTION_SECRET environment variable is not set');
    }

    // AES-256 requires exactly 32 bytes — we hash the secret to guarantee this
    // even if someone sets a key that isn't exactly 32 chars
    this.secretKey = crypto.createHash('sha256').update(secret).digest();
  }

  // ─── AES-256-CBC Encryption ───────────────────────────────────────────────

  // Encrypts a plain text string — returns "iv:encryptedData" format
  // IV (Initialization Vector) is random each time — same input ≠ same output
  // This prevents attackers from detecting two users with the same NID
  encrypt(plainText: string): string {
    const iv = crypto.randomBytes(16); // 16 bytes = 128 bits IV
    const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);

    // Encrypt the data in two parts — update + final
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    // Store IV alongside encrypted data — needed for decryption
    // Format: "ivHex:encryptedHex"
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  // Decrypts a previously encrypted string back to plain text
  decrypt(encryptedText: string): string {
    // Split back into IV and encrypted data
    const [ivHex, encryptedHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.secretKey,
      iv,
    );

    // Decrypt and return as plain text string
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  // ─── SHA-256 Hashing (one-way) ────────────────────────────────────────────

  // Creates a SHA-256 hash of a value — used for:
  // 1. PID lookup hash (find a user by PID without decrypting every row)
  // 2. Email verification token storage (never store raw tokens in DB)
  hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  // Compares a plain value against a stored hash — constant time comparison
  // prevents timing attacks (attacker measuring response time to guess values)
  compareHash(plainValue: string, hash: string): boolean {
    const hashedValue = this.hash(plainValue);
    // timingSafeEqual prevents timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(hashedValue, 'hex'),
      Buffer.from(hash, 'hex'),
    );
  }
}
