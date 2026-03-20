// Shapes for the engine response and internal verification result
// Keeps our types explicit — no implicit any

export interface EngineScoreBreakdown {
  face_similarity: number;
  liveness_confidence: number;
  document_match: boolean;
  composite_score: number;
}

export interface EngineVerificationResponse {
  passed: boolean;
  scores: EngineScoreBreakdown;
  fail_reason: string | null;
  id_image_quality: 'good' | 'blurry' | 'no_face' | 'too_dark';
  selfie_quality: 'good' | 'blurry' | 'no_face' | 'too_dark';
}

// What we return to the frontend after verification
export interface VerificationResult {
  success: boolean;
  passed: boolean;
  compositeScore: number;
  faceScore: number;
  livenessScore: number;
  documentMatch: boolean;
  message: string;
  failReason: string | null;
  attemptsUsed: number;
  attemptsRemaining: number;
}
