/**
 * Centralized AI model configuration
 * All temperature, topK, topP settings in one place
 * Based on actual usage across all services
 */

export interface ModelPreset {
  temperature: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  description: string;
}

export const MODEL_PRESETS = {
  // Ultra-precise: For REMOVE, INTERNAL_MODIFY operations (Flash model)
  FLASH_PRECISION: {
    temperature: 0.1,
    topP: 0.85,
    topK: 25,
    description: 'Maximum precision for Flash model - REMOVE, INTERNAL_MODIFY',
  },

  // High-precision: For REMOVE, INTERNAL_MODIFY operations (Pro model)
  PRO_PRECISION: {
    temperature: 0.15,
    topP: 0.85,
    topK: 25,
    description: 'High precision for Pro model - REMOVE, INTERNAL_MODIFY',
  },

  // Creative Flash: For EDIT, STYLE operations (Flash model)
  FLASH_CREATIVE: {
    temperature: 0.15,
    topP: 0.85,
    topK: 25,
    description: 'Controlled creativity for Flash model - EDIT, STYLE',
  },

  // Creative Pro: For EDIT, STYLE operations (Pro model)
  PRO_CREATIVE: {
    temperature: 0.4,
    topP: 0.85,
    topK: 25,
    description: 'Creative for Pro model - EDIT, STYLE',
  },

  // Object Detection
  OBJECT_DETECTION: {
    temperature: 0.3,
    description: 'Object detection and scanning',
  },

  // Quality Analysis (main)
  QUALITY_ANALYSIS: {
    temperature: 0.3,
    description: 'Quality analysis - main',
  },

  // Quality Analysis (fallback)
  QUALITY_ANALYSIS_FALLBACK: {
    temperature: 0.2,
    description: 'Quality analysis - fallback',
  },

  // Intent Parsing (no temperature specified, using balanced default)
  INTENT_PARSING: {
    temperature: 0.3,
    description: 'Intent parsing and translation',
  },

  // Reference Analysis
  REFERENCE_ANALYSIS: {
    temperature: 0.2,
    description: 'Reference image analysis',
  },

  // Prompt Pattern Analysis
  PROMPT_PATTERN: {
    temperature: 0.3,
    maxOutputTokens: 200,
    description: 'Prompt pattern analysis',
  },

  // Suggestions - 2D Plan Style
  SUGGESTION_2D_PLAN: {
    temperature: 0.7,
    description: 'Style card generation for 2D plans',
  },

  // Suggestions - 3D Room
  SUGGESTION_3D_ROOM: {
    temperature: 0.85,
    description: 'Design suggestions for 3D rooms',
  },

  // Rendering - Structure (Stage 1)
  RENDER_STRUCTURE: {
    temperature: 0.15,
    description: '3D structure generation - Stage 1',
  },

  // Rendering - Style (Stage 2)
  RENDER_STYLE: {
    temperature: 0.18,
    description: '3D style application - Stage 2',
  },

  // Rendering - Single Stage
  RENDER_SINGLE: {
    temperature: 0.2,
    description: 'Single-stage rendering',
  },

  // Autonomous Agent - High
  AUTONOMOUS_HIGH: {
    temperature: 0.7,
    description: 'Autonomous agent - high creativity',
  },

  // Autonomous Agent - Low
  AUTONOMOUS_LOW: {
    temperature: 0.2,
    description: 'Autonomous agent - low creativity',
  },
} as const;

export type PresetName = keyof typeof MODEL_PRESETS;

/**
 * Edit mode types - canonical modes for image editing
 */
export type EditMode =
  | 'GLOBAL_STYLE'
  | 'OBJECT_REPLACEMENT'
  | 'SURFACE_REPLACEMENT'
  | 'MINOR_EDIT';

/**
 * Operation-specific preset mapping
 */
export const OPERATION_PRESETS: Record<string, PresetName> = {
  // Image Editing Operations
  REMOVE: 'FLASH_PRECISION', // Will be overridden by model type
  MOVE: 'FLASH_PRECISION',
  EDIT: 'FLASH_CREATIVE',
  STYLE: 'FLASH_CREATIVE',
  INTERNAL_MODIFY: 'FLASH_PRECISION',

  // Analysis Operations
  OBJECT_DETECTION: 'OBJECT_DETECTION',
  ROOM_ANALYSIS: 'INTENT_PARSING',
  QUALITY_ANALYSIS: 'QUALITY_ANALYSIS',
  QUALITY_ANALYSIS_FALLBACK: 'QUALITY_ANALYSIS_FALLBACK',
  INTENT_PARSING: 'INTENT_PARSING',
  REFERENCE_ANALYSIS: 'REFERENCE_ANALYSIS',
  PROMPT_PATTERN: 'PROMPT_PATTERN',

  // Generation Operations
  SUGGESTION_2D_PLAN: 'SUGGESTION_2D_PLAN',
  SUGGESTION_3D_ROOM: 'SUGGESTION_3D_ROOM',
  RENDER_STRUCTURE: 'RENDER_STRUCTURE',
  RENDER_STYLE: 'RENDER_STYLE',
  RENDER_SINGLE: 'RENDER_SINGLE',
  AUTONOMOUS_HIGH: 'AUTONOMOUS_HIGH',
  AUTONOMOUS_LOW: 'AUTONOMOUS_LOW',
};

/**
 * Get preset for operation
 */
export function getPresetForOperation(operation: string): ModelPreset {
  const presetName = OPERATION_PRESETS[operation] || 'INTENT_PARSING';
  return MODEL_PRESETS[presetName];
}

/**
 * Edit mode presets - temperature and sampling bound to mode
 */
export const EDIT_MODE_PRESETS = {
  GLOBAL_STYLE: {
    pro: {
      temperature: 0.18,
      topP: 0.85,
      topK: 25,
      description: 'Scene-wide style transfer, controlled creativity (lower temp to prevent reference return)',
    },
    flash: {
      temperature: 0.15,
      topP: 0.85,
      topK: 25,
      description: 'Scene-wide style transfer, controlled creativity (Flash)',
    },
    description: 'Scene-wide style transfer, controlled creativity',
  },

  OBJECT_REPLACEMENT: {
    pro: MODEL_PRESETS.PRO_PRECISION,
    flash: MODEL_PRESETS.FLASH_PRECISION,
    description: 'Hard delete + insert, no blending',
  },

  SURFACE_REPLACEMENT: {
    pro: {
      temperature: 0.12,
      topP: 0.85,
      topK: 25,
      description: 'Material system replacement (floors, walls)',
    },
    flash: {
      temperature: 0.1,
      topP: 0.85,
      topK: 25,
      description: 'Material system replacement (Flash)',
    },
  },

  MINOR_EDIT: {
    pro: {
      temperature: 0.25,
      topP: 0.85,
      topK: 25,
      description: 'Small visual edits',
    },
    flash: {
      temperature: 0.2,
      topP: 0.85,
      topK: 25,
      description: 'Small visual edits',
    },
  },
} as const;

/**
 * Get image editing config based on model and edit mode
 * This replaces the old operation-based config
 */
export function getImageEditingConfigForMode(
  modelId: string,
  editMode: EditMode
): { temperature: number; topP: number; topK: number } {
  const isPro = modelId.includes('pro');
  const preset = EDIT_MODE_PRESETS[editMode];

  const config = isPro ? preset.pro : preset.flash;
  return {
    temperature: config.temperature,
    topP: config.topP || 0.85,
    topK: config.topK || 25,
  };
}

/**
 * @deprecated Use getImageEditingConfigForMode instead
 * Kept for backward compatibility
 */
export function getImageEditingConfig(
  modelId: string,
  operationType: string
): { temperature: number; topP: number; topK: number } {
  const isPro = modelId.includes('pro');
  const isInternalModify = operationType === 'INTERNAL_MODIFY';
  const isRemoval = operationType === 'REMOVE';

  if (isInternalModify || isRemoval) {
    return isPro
      ? {
          temperature: MODEL_PRESETS.PRO_PRECISION.temperature,
          topP: MODEL_PRESETS.PRO_PRECISION.topP!,
          topK: MODEL_PRESETS.PRO_PRECISION.topK!,
        }
      : {
          temperature: MODEL_PRESETS.FLASH_PRECISION.temperature,
          topP: MODEL_PRESETS.FLASH_PRECISION.topP!,
          topK: MODEL_PRESETS.FLASH_PRECISION.topK!,
        };
  } else {
    return isPro
      ? {
          temperature: MODEL_PRESETS.PRO_CREATIVE.temperature,
          topP: MODEL_PRESETS.PRO_CREATIVE.topP!,
          topK: MODEL_PRESETS.PRO_CREATIVE.topK!,
        }
      : {
          temperature: MODEL_PRESETS.FLASH_CREATIVE.temperature,
          topP: MODEL_PRESETS.FLASH_CREATIVE.topP!,
          topK: MODEL_PRESETS.FLASH_CREATIVE.topK!,
        };
  }
}

/**
 * Image size constant
 */
export const IMAGE_SIZE_2K = '2K' as const;

