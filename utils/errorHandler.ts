
export class AppError extends Error {
  public type: 'RATE_LIMIT' | 'BILLING' | 'NETWORK' | 'UNKNOWN';
  public originalError: any;

  constructor(message: string, type: 'RATE_LIMIT' | 'BILLING' | 'NETWORK' | 'UNKNOWN' = 'UNKNOWN', originalError?: any) {
    super(message);
    this.type = type;
    this.originalError = originalError;
  }
}

/**
 * Maps raw API errors to typed AppErrors.
 */
export const mapApiError = (error: any): AppError => {
  const msg = error?.message || '';
  
  if (msg.includes('429')) {
    return new AppError('Rate limit exceeded. Please wait a moment.', 'RATE_LIMIT', error);
  }
  
  if (msg.includes('PERMISSION_DENIED') || msg.includes('403') || msg.includes('Requested entity was not found')) {
    return new AppError('Billing required or API Key invalid.', 'BILLING', error);
  }
  
  if (msg.includes('quota')) {
    return new AppError('Quota exceeded.', 'RATE_LIMIT', error);
  }

  return new AppError(msg || 'An unexpected error occurred.', 'UNKNOWN', error);
};
