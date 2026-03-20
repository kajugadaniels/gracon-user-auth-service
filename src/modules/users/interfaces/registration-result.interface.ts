// What the registration endpoint returns to the frontend
// Never includes sensitive fields like passwordHash, nidEncrypted, etc.
export interface RegistrationResult {
  success: boolean;
  message: string;
  data: {
    userId: string;
    email: string;
    surName: string;
    postNames: string;
    platformId: string; // decrypted PID — shown once at registration
  };
}
