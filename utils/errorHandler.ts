/**
 * Error handling utilities for mapping API errors to user-friendly messages.
 */
export type AppErrorType = 'RATE_LIMIT' | 'BILLING' | 'NETWORK' | 'UNKNOWN';

export class AppError extends Error {
  public type: AppErrorType;
  public originalError: Error | unknown;

  constructor(message: string, type: AppErrorType = 'UNKNOWN', originalError?: Error | unknown) {
    super(message);
    this.type = type;
    this.originalError = originalError;
  }
}

export const mapApiError = (error: Error | unknown): AppError => {
  const msg = error instanceof Error ? error.message : String(error);

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
