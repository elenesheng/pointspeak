import { GoogleGenAI } from '@google/genai';
import { getApiKey } from '../../utils/apiUtils';

/**
 * Gemini Context Cache Manager
 * 
 * Uses Gemini's native server-side caching API for efficient context management.
 * 
 * Features:
 * - Bounded size (never grows beyond limit)
 * - Auto-summarization when too many learnings
 * - Smart refresh (only when needed)
 * - Cost efficient (reuses cached context via Gemini's server)
 */

// Cache configuration
const CACHE_CONFIG = {
  maxLearnings: 10,        // Keep only top 10 learnings
  maxTokenEstimate: 300,   // Target ~300 tokens for context
  refreshAfterEdits: 10,   // Refresh summary every 10 edits
  maxAgeMs: 30 * 60 * 1000, // 30 minutes max age
  ttlSeconds: 3600,        // 1 hour TTL on Gemini's side
};

// Learning types
export interface CachedLearning {
  type: 'hallucination' | 'quality' | 'style' | 'success';
  operation: string;
  description: string;
  timestamp: number;
  weight: number; // Higher = more important
}

// Cache state (in-memory + localStorage)
interface CacheState {
  cacheName: string | null; // Gemini cache resource name
  cacheModel: string | null; // Model the cache was created for (must match)
  learnings: CachedLearning[];
  editsSinceRefresh: number;
  lastRefreshTime: number;
  version: number;
}

// Singleton state
let cacheState: CacheState = {
  cacheName: null,
  cacheModel: null, // Track which model the cache was created for
  learnings: [],
  editsSinceRefresh: 0,
  lastRefreshTime: 0,
  version: 0,
};

// Load from localStorage on init
const STORAGE_KEY = 'pointspeak-gemini-cache-state';

function loadState(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      cacheState = {
        ...parsed,
        cacheName: null, // Always invalidate on reload (server cache may have expired)
        cacheModel: null, // Clear model tracking on reload
      };
    }
  } catch (e) {
    console.warn('[Gemini Cache] Failed to load state:', e);
  }
}

function saveState(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const stateToSave = {
      ...cacheState,
      // Don't save cacheName if it's null (will be recreated)
      cacheName: cacheState.cacheName || null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    console.log('[Gemini Cache] State saved:', {
      learningCount: cacheState.learnings.length,
      cacheName: cacheState.cacheName ? 'exists' : 'null',
      editsSinceRefresh: cacheState.editsSinceRefresh
    });
  } catch (e) {
    console.warn('[Gemini Cache] Failed to save state:', e);
  }
}

// Initialize on module load
loadState();

/**
 * Add a learning to the cache
 * Does NOT refresh cache immediately - just marks it as stale
 */
export function addLearning(learning: Omit<CachedLearning, 'timestamp' | 'weight'>): void {
  const newLearning: CachedLearning = {
    ...learning,
    timestamp: Date.now(),
    weight: learning.type === 'hallucination' ? 3 : learning.type === 'quality' ? 2 : 1,
  };

  cacheState.learnings.push(newLearning);
  
  // BOUNDED: Keep only top N learnings by weight and recency
  if (cacheState.learnings.length > CACHE_CONFIG.maxLearnings) {
    cacheState.learnings = pruneAndSummarize(cacheState.learnings);
  }

  // Mark cache as stale (will refresh on next request if conditions met)
  cacheState.cacheName = null;
  cacheState.cacheModel = null;
  saveState();
  
  console.log(`[Gemini Cache] Added learning: ${learning.type} - ${learning.operation}`);
}

/**
 * Record an edit (for refresh counting)
 */
export function recordEdit(): void {
  cacheState.editsSinceRefresh++;
  saveState();
}

/**
 * Check if cache needs refresh
 */
function needsRefresh(): boolean {
  // No cache exists
  if (!cacheState.cacheName) return true;
  
  // Too many edits since last refresh
  if (cacheState.editsSinceRefresh >= CACHE_CONFIG.refreshAfterEdits) return true;
  
  // Cache too old (only check if cache was actually created)
  if (cacheState.lastRefreshTime > 0 && 
      Date.now() - cacheState.lastRefreshTime > CACHE_CONFIG.maxAgeMs) {
    return true;
  }
  
  return false;
}

/**
 * Prune learnings to keep size bounded
 * Summarizes similar learnings
 */
function pruneAndSummarize(learnings: CachedLearning[]): CachedLearning[] {
  // Sort by weight (importance) and recency
  const sorted = [...learnings].sort((a, b) => {
    const weightDiff = b.weight - a.weight;
    if (weightDiff !== 0) return weightDiff;
    return b.timestamp - a.timestamp;
  });

  // Group by type and operation
  const groups: Record<string, CachedLearning[]> = {};
  sorted.forEach(l => {
    const key = `${l.type}_${l.operation}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(l);
  });

  // Summarize groups with multiple entries
  const summarized: CachedLearning[] = [];
  
  Object.entries(groups).forEach(([key, items]) => {
    if (items.length > 2) {
      // Summarize: "3 hallucination issues on MOVE operations"
      summarized.push({
        type: items[0].type,
        operation: items[0].operation,
        description: `${items.length} ${items[0].type} issues on ${items[0].operation} operations`,
        timestamp: Math.max(...items.map(i => i.timestamp)),
        weight: items[0].weight + 1, // Boost weight for repeated issues
      });
    } else {
      summarized.push(...items);
    }
  });

  // Keep only top N
  return summarized.slice(0, CACHE_CONFIG.maxLearnings);
}

/**
 * Build context string from learnings (bounded size)
 */
function buildContextString(): string {
  if (cacheState.learnings.length === 0) {
    return '';
  }

  const sections: string[] = [];

  // Group by type for cleaner context
  const byType: Record<string, CachedLearning[]> = {};
  cacheState.learnings.forEach(l => {
    if (!byType[l.type]) byType[l.type] = [];
    byType[l.type].push(l);
  });

  // Hallucinations (most important)
  if (byType.hallucination?.length) {
    const count = byType.hallucination.length;
    const ops = [...new Set(byType.hallucination.map(l => l.operation))].join(', ');
    sections.push(`CRITICAL: User reported ${count} hallucination issue(s) on: ${ops}. Be precise.`);
  }

  // Quality issues
  if (byType.quality?.length) {
    sections.push(`Quality: User sensitive to output quality. Prioritize clarity.`);
  }

  // Style preferences
  if (byType.style?.length) {
    const styles = byType.style.map(l => l.description).slice(0, 3).join(', ');
    sections.push(`Style: ${styles}`);
  }

  // Successes (what worked)
  if (byType.success?.length) {
    const successOps = [...new Set(byType.success.map(l => l.operation))].join(', ');
    sections.push(`Works well: ${successOps} operations.`);
  }

  return sections.join('\n');
}

/**
 * Check if model supports server-side caching
 * Image-specific models (gemini-X-pro-image-preview, gemini-X-flash-image) don't support caching
 * Reasoning models (gemini-X-flash, gemini-X-pro) DO support caching
 */
function modelSupportsCaching(model: string): boolean {
  // Image models - NO caching support
  if (model.includes('-image') || model.includes('image-')) {
    return false;
  }
  
  // Reasoning models - YES caching support
  if (model.includes('flash') || model.includes('pro')) {
    // But NOT if they're image variants (e.g., gemini-3-pro-image-preview)
    return !model.includes('preview') || !model.includes('image');
  }
  
  // Default: assume it supports caching (for future models)
  return true;
}

/**
 * Get or create Gemini cached context
 * Returns cache name for use in generateContent calls
 * @param model - The model name that will be used (cache model must match)
 */
export async function getGeminiCacheName(model: string, nonBlocking: boolean = false): Promise<string | null> {
  // Check if model supports caching
  // Image-specific models (gemini-3-pro-image-preview, gemini-3-flash-image) don't support caching
  // This is a Google API limitation - we must use inline context for these models
  if (!modelSupportsCaching(model)) {
    console.log(`[Gemini Cache] Model ${model} doesn't support server-side caching (image models limitation). Using inline context instead.`);
    // Clear any stale cache name to prevent confusion
    if (cacheState.cacheName) {
      cacheState.cacheName = null;
      cacheState.cacheModel = null;
      saveState();
    }
    return null;
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  // Check if we can reuse existing cache
  // Cache must: 1) exist, 2) be for same model, 3) model must support caching, 4) not need refresh
  const canReuseCache = cacheState.cacheName && 
                        cacheState.cacheModel === model &&
                        modelSupportsCaching(model) &&
                        !needsRefresh();
  
  if (canReuseCache) {
    console.log('[Gemini Cache] ✓ Reusing existing cache:', cacheState.cacheName, {
      model: model,
      editsSinceRefresh: cacheState.editsSinceRefresh,
      age: Math.round((Date.now() - cacheState.lastRefreshTime) / 1000) + 's'
    });
    return cacheState.cacheName;
  }
  
  // If cache exists but model doesn't match or doesn't support caching, clear it
  if (cacheState.cacheName && (cacheState.cacheModel !== model || !modelSupportsCaching(model))) {
    console.log('[Gemini Cache] Clearing cache - model mismatch or unsupported:', {
      cachedModel: cacheState.cacheModel,
      currentModel: model,
      supportsCaching: modelSupportsCaching(model)
    });
    cacheState.cacheName = null;
    cacheState.cacheModel = null;
    saveState();
  }
  
  // Log why we're refreshing (if we need to)
  const needsRefreshResult = needsRefresh();
  if (needsRefreshResult) {
    const reasons = [];
    if (!cacheState.cacheName) reasons.push('no cache exists');
    if (cacheState.editsSinceRefresh >= CACHE_CONFIG.refreshAfterEdits) reasons.push(`${cacheState.editsSinceRefresh} edits (limit: ${CACHE_CONFIG.refreshAfterEdits})`);
    if (cacheState.lastRefreshTime > 0 && Date.now() - cacheState.lastRefreshTime > CACHE_CONFIG.maxAgeMs) reasons.push('cache too old');
    if (reasons.length > 0) {
      console.log('[Gemini Cache] ⟳ Refreshing cache. Reasons:', reasons.join(', '));
    }
  }

  // Build new context
  const contextString = buildContextString();
  
  // Estimate token count (rough: 1 token ≈ 4 characters)
  const estimatedTokens = Math.ceil(contextString.length / 4);
  
  // EARLY EXIT: Gemini requires minimum 1024 tokens for cache creation
  // If context is too small, skip caching (not worth it)
  if (estimatedTokens < 1024) {
    console.log(`[Gemini Cache] Context too small (${estimatedTokens} tokens, need 1024), skipping cache creation. Using inline context.`);
    // If we have an existing cache for this model, keep using it
    if (cacheState.cacheName && cacheState.cacheModel === model) {
      return cacheState.cacheName;
    }
    return null;
  }

  try {
    // Delete old cache if exists (cleanup)
    if (cacheState.cacheName) {
      try {
        await ai.caches.delete({ name: cacheState.cacheName });
        console.log('[Gemini Cache] Deleted old cache');
      } catch (e) {
        // Cache may have expired, ignore
        console.log('[Gemini Cache] Old cache already expired or not found');
      }
    }

    // Create new cached content using Gemini's API
    // Based on SDK: config contains contents, displayName, systemInstruction, ttl
    // IMPORTANT: Model must match the model used in generateContent calls
    const cacheResponse = await ai.caches.create({
      model: model,
      config: {
        contents: [{
          role: 'user',
          parts: [{ text: `USER LEARNING CONTEXT:\n${contextString}` }]
        }],
        displayName: `pointspeak-user-${Date.now()}`,
        ttl: `${CACHE_CONFIG.ttlSeconds}s`,
      }
    });

    // Extract cache name/resource name
    const cacheName = cacheResponse.name || null;

    // Update state
    cacheState.cacheName = cacheName;
    cacheState.cacheModel = model; // Track which model this cache is for
    cacheState.editsSinceRefresh = 0;
    cacheState.lastRefreshTime = Date.now();
    cacheState.version++;
    saveState();

    console.log('[Gemini Cache] Created new cache:', cacheName);
    return cacheName;

  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    
    // Don't spam logs for expected failures (model doesn't support caching)
    if (errorMessage.includes('not supported') || 
        errorMessage.includes('not found') ||
        error?.status === 404 ||
        errorMessage.includes('INVALID_ARGUMENT')) {
      console.log(`[Gemini Cache] Model doesn't support caching (expected): ${errorMessage.slice(0, 100)}`);
    } else {
      console.warn('[Gemini Cache] Failed to create cache:', errorMessage);
    }
    
    // Clear stale cache name
    cacheState.cacheName = null;
    cacheState.cacheModel = null;
    saveState();
    
    return null;
  }
}

/**
 * Get context as inline string (fallback when cache unavailable)
 * This is BOUNDED and won't grow indefinitely
 */
export function getInlineContext(): string {
  return buildContextString();
}

/**
 * Force refresh on next request (call after dislike)
 */
export function invalidateCache(): void {
  cacheState.cacheName = null;
  cacheState.cacheModel = null;
  saveState();
  console.log('[Gemini Cache] Invalidated - will refresh on next request');
}

/**
 * Clear all learnings (call on image removal)
 */
export function clearLearnings(): void {
  cacheState = {
    cacheName: null,
    cacheModel: null,
    learnings: [],
    editsSinceRefresh: 0,
    lastRefreshTime: 0,
    version: 0,
  };
  saveState();
  console.log('[Gemini Cache] Cleared all learnings');
}

/**
 * Get learned patterns for a specific operation type
 * Returns what worked and what failed for that operation
 */
export function getLearnedPatternsForOperation(operationType: string): {
  successfulPatterns: string[];
  failedPatterns: string[];
  failureReasons: string[];
} {
  const operationLearnings = cacheState.learnings.filter(l => l.operation === operationType);
  
  const successfulPatterns = operationLearnings
    .filter(l => l.type === 'success')
    .map(l => l.description);
  
  const failedPatterns = operationLearnings
    .filter(l => l.type !== 'success')
    .map(l => l.description);
  
  const failureReasons = operationLearnings
    .filter(l => l.type !== 'success')
    .map(l => `${l.type}: ${l.description}`);

  return {
    successfulPatterns,
    failedPatterns,
    failureReasons,
  };
}

/**
 * Get stats for debugging/display
 */
export function getCacheStats(): {
  learningCount: number;
  editsSinceRefresh: number;
  cacheAge: number;
  hasCachedContext: boolean;
} {
  return {
    learningCount: cacheState.learnings.length,
    editsSinceRefresh: cacheState.editsSinceRefresh,
    cacheAge: cacheState.lastRefreshTime ? Date.now() - cacheState.lastRefreshTime : 0,
    hasCachedContext: !!cacheState.cacheName,
  };
}
