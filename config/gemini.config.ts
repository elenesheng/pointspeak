
/**
 * Configuration for Google Gemini API services.
 */
export const GEMINI_CONFIG = {
  MODELS: {
    // Primary Reasoning: "Thinking" model to reduce hallucinations
    REASONING: 'gemini-3-pro-preview', 
    
    // Fallback Reasoning & Fast Vision
    REASONING_FALLBACK: 'gemini-3-flash-preview',
    
    // Image Generation Options
    IMAGE_EDITING_FLASH: 'gemini-3-pro-image-preview',
    IMAGE_EDITING_PRO: 'gemini-2.5-flash-image',
  },
  SETTINGS: {
    MAX_RETRIES: 2, 
    TIMEOUT_MS: 60000, 
    CACHE_TTL_MS: 1000 * 60 * 10, 
  },
  FLAGS: {
    ENABLE_CACHING: true,
    ENABLE_FALLBACK_GENERATION: true,
  }
};
