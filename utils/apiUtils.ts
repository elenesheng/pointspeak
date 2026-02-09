import { GEMINI_CONFIG } from '../config/gemini.config';

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

const CACHE_VERSION = 'v2'; // Increment when changing logic

export const generateCacheKey = (prefix: string, ...args: unknown[]): string => {
  return `${CACHE_VERSION}_${prefix}_${JSON.stringify(args)}`;
};

/**
 * Executes a function with retry logic and optional caching.
 * Uses exponential backoff for retries and skips retries on auth errors.
 */
export async function withSmartRetry<T>(fn: () => Promise<T>, cacheKey?: string): Promise<T> {
  if (GEMINI_CONFIG.FLAGS.ENABLE_CACHING && cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < GEMINI_CONFIG.SETTINGS.CACHE_TTL_MS) {
      return cached.data as T;
    }
  }

  let lastError: Error | unknown;

  for (let i = 0; i < GEMINI_CONFIG.SETTINGS.MAX_RETRIES; i++) {
    try {
      const result = await fn();

      if (GEMINI_CONFIG.FLAGS.ENABLE_CACHING && cacheKey) {
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
      }

      return result;
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : '';
      
      // Don't retry on auth errors or rate limits
      // 429 retries cause a cascade - each retry triggers more 429s
      if (errorMessage.includes('PERMISSION_DENIED') ||
          errorMessage.includes('403') ||
          errorMessage.includes('401') ||
          errorMessage.includes('429') ||
          errorMessage.includes('Too Many Requests') ||
          errorMessage.includes('RESOURCE_EXHAUSTED')) {
        throw error;
      }
      
      if (i < GEMINI_CONFIG.SETTINGS.MAX_RETRIES - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export const clearAllCaches = () => {
  cache.clear();
};

/**
 * Executes primary function, falling back to secondary function on failure.
 */
export async function runWithFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  contextLabel: string = 'Operation'
): Promise<T> {
  try {
    return await primaryFn();
  } catch (error) {
    try {
      return await fallbackFn();
    } catch (fallbackError) {
      console.error(`${contextLabel} fallback also failed.`, fallbackError);
      throw fallbackError;
    }
  }
}

export const getApiKey = () => {
  const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY || 
              process.env.GEMINI_API_KEY || 
              process.env.API_KEY || '';
  return key;
};
