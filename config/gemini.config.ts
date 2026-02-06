
/**
 * Configuration for Google Gemini API services.
 */
export const GEMINI_CONFIG = {
  MODELS: {
    // Primary Reasoning: Use 2.5 Flash for speed and reliability with JSON Schemas
    REASONING: 'gemini-3-flash-preview',

    // Fallback
    REASONING_FALLBACK: 'gemini-2.5-flash',
    
    // Image Generation Options
    // General Image Generation: gemini-2.5-flash-image (Nano Banana)
    IMAGE_EDITING_FLASH: 'gemini-2.5-flash-image',
    // High-Quality: gemini-3-pro-image-preview (Nano Banana Pro / Imagen 3)
    IMAGE_EDITING_PRO: 'gemini-3-pro-image-preview',
  },
  SETTINGS: {
    MAX_RETRIES: 2, 
    TIMEOUT_MS: 60000, 
    CACHE_TTL_MS: 1000 * 60 * 30, // 30 minutes (was 10)
  },
  FLAGS: {
    ENABLE_CACHING: true,
    ENABLE_FALLBACK_GENERATION: true,
    PREFER_IMAGEN: true, // Try Imagen first if configured, fallback to Gemini
    ENABLE_MULTI_PASS_GLOBAL_STYLE: true, // Enable multi-pass orchestration for global style edits
  }
};
