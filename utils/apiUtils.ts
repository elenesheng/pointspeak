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

export async function withSmartRetry<T>(fn: () => Promise<T>, cacheKey?: string): Promise<T> {
  // Check cache first (if enabled)
  if (GEMINI_CONFIG.FLAGS.ENABLE_CACHING && cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < GEMINI_CONFIG.SETTINGS.CACHE_TTL_MS) {
      console.log(`[Client Cache] ✓ Hit: ${cacheKey.slice(0, 50)}...`);
      return cached.data as T;
    }
  }

  let lastError: Error | unknown;

  for (let i = 0; i < GEMINI_CONFIG.SETTINGS.MAX_RETRIES; i++) {
    try {
      const result = await fn();

      // Store in cache (if enabled)
      if (GEMINI_CONFIG.FLAGS.ENABLE_CACHING && cacheKey) {
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
        console.log(`[Client Cache] ✓ Stored: ${cacheKey.slice(0, 50)}...`);
      }

      return result;
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : '';
      
      // Don't retry on auth errors
      if (errorMessage.includes('PERMISSION_DENIED') || 
          errorMessage.includes('403') ||
          errorMessage.includes('401')) {
        throw error;
      }
      
      // Exponential backoff
      if (i < GEMINI_CONFIG.SETTINGS.MAX_RETRIES - 1) {
        const delay = Math.pow(2, i) * 1000;
        console.log(`[Retry] Attempt ${i + 1} failed, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export const clearAllCaches = () => {
  cache.clear();
  console.log('[Client Cache] ✓ Cleared all cached data');
};

export async function runWithFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  contextLabel: string = 'Operation'
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

export const getApiKey = () => {
  // Next.js requires NEXT_PUBLIC_ prefix for client-side env vars
  const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY || 
              process.env.GEMINI_API_KEY || 
              process.env.API_KEY || '';
  return key;
};
