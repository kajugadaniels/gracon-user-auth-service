// Shapes for JWT payload and auth responses
// Keeping these explicit prevents accidentally leaking sensitive fields

export interface JwtPayload {
  sub: string; // userId — standard JWT subject claim
  email: string;
  iat?: number; // issued at — added automatically by @nestjs/jwt
  exp?: number; // expiry — added automatically
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult {
  success: boolean;
  message: string;
  data: {
    accessToken: string;
    refreshToken: string;
    user: SafeUserProfile;
  };
}

// Safe user shape — never includes passwordHash, nidEncrypted, pidEncrypted
export interface SafeUserProfile {
  userId: string;
  email: string;
  phoneNumber: string | null;
  imageUrl: string | null;
  surName: string;
  postNames: string;
  sex: string;
  isIdVerified: boolean;
  idVerifiedAt: Date | null;
  createdAt: Date;
}
