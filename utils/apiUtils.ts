
import { GEMINI_CONFIG } from '../config/gemini.config';

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Generates a cache key from arguments.
 */
export const generateCacheKey = (prefix: string, ...args: unknown[]): string => {
  return `${prefix}_${JSON.stringify(args)}`;
};

/**
 * Wraps an async function with retry logic and caching.
 */
export async function withSmartRetry<T>(
  fn: () => Promise<T>, 
  cacheKey?: string
): Promise<T> {
  // 1. Check Cache
  if (GEMINI_CONFIG.FLAGS.ENABLE_CACHING && cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < GEMINI_CONFIG.SETTINGS.CACHE_TTL_MS)) {
      console.log(`[Cache Hit] ${cacheKey}`);
      return cached.data as T;
    }
  }

  let lastError: any;
  
  // 2. Retry Loop
  for (let i = 0; i < GEMINI_CONFIG.SETTINGS.MAX_RETRIES; i++) {
    try {
      const result = await fn();
      
      // 3. Set Cache
      if (GEMINI_CONFIG.FLAGS.ENABLE_CACHING && cacheKey) {
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      // Don't retry on Billing errors (403)
      if (error?.message?.includes('PERMISSION_DENIED') || error?.message?.includes('403')) {
        throw error;
      }
      // Exponential backoff
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Executes a primary function, failing over to a secondary function on error.
 */
export async function runWithFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  contextLabel: string = "Operation"
): Promise<T> {
  try {
    return await primaryFn();
  } catch (error) {
    console.warn(`${contextLabel} primary model failed, falling back...`, error);
    try {
      return await fallbackFn();
    } catch (fallbackError) {
      console.error(`${contextLabel} fallback also failed.`, fallbackError);
      throw fallbackError;
    }
  }
}

export const getApiKey = () => process.env.API_KEY || '';
