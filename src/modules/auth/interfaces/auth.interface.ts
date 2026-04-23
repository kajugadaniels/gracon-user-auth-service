import { IdentityType } from '@prisma/client';

// Shapes for JWT payload and auth responses
// Keeping these explicit prevents accidentally leaking sensitive fields

export interface JwtPayload {
  sub: string; // userId — standard JWT subject claim
  email: string;
  tokenType: 'full' | 'limited'; // "full" = all routes, "limited" = verify-identity only
  iat?: number; // issued at — added automatically by @nestjs/jwt
  exp?: number; // expiry — added automatically
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'full' | 'limited'; // Tells the frontend which flow to enter
}

export interface LoginResult {
  success: boolean;
  message: string;
  tokenType: 'full' | 'limited';
  data: {
    accessToken: string;
    refreshToken: string;
    user: SafeUserProfile;
  };
}

// Safe user shape — never includes passwordHash, nidEncrypted, finEncrypted, pidEncrypted
export interface SafeUserProfile {
  userId: string;
  email: string;
  phoneNumber: string | null;
  imageUrl: string | null;
  surName: string;
  postNames: string;
  sex: string;
  identityType: IdentityType;
  fin: string | null;
  isIdVerified: boolean;
  idVerifiedAt: Date | null;
  createdAt: Date;
}
