import { GoogleGenAI } from '@google/genai';
import { GEMINI_CONFIG } from '../../config/gemini.config';
import { getApiKey, withSmartRetry, generateCacheKey } from '../../utils/apiUtils';
import { DesignSuggestion, OperationType } from '../../types/ai.types';
import { DetailedRoomAnalysis, IdentifiedObject } from '../../types/spatial.types';
import { getGeminiCacheName, getLearnedPatternsForOperation, getInlineContext } from './contextCacheService';
import { getPresetForOperation } from '../../config/modelConfigs';
import { build2DPlanStylePrompt } from '../../config/prompts/suggestions/2d-plan';
import { build3DRoomImprovementPrompt, buildObjectSpecificPrompt } from '../../config/prompts/suggestions/3d-room';

// Unified suggestion types
export type SuggestionMode = '2d-plan-style' | '3d-room-improvement' | '3d-object-specific';

export interface SuggestionContext {
  mode: SuggestionMode;
  imageBase64: string;
  roomAnalysis: DetailedRoomAnalysis;
  detectedObjects: IdentifiedObject[];
  userGoal: string;
  learningContext?: {
    stylePreferences: string[];
    avoidedActions: string[];
    contextualInsights: string;
  };
}

export interface LearningContext {
  stylePreferences?: string[];
  avoidedActions?: string[];
  contextualInsights?: string;
}

export interface FloorPlanStyle {
  id: string;
  name: string;
  description: string;
  why_fits: string;
  confidence: number;
  preview_prompt: string;
  characteristics: string[];
}

interface SuggestionRaw {
  title?: string;
  description?: string;
  action_type?: OperationType;
  target_object_name?: string;
  suggested_prompt?: string;
  icon_hint?: 'color' | 'layout' | 'style' | 'remove';
  confidence?: number;
  characteristics?: string[];
  why_fits?: string;
}

const cleanJson = (text: string): string => {
  let clean = text.trim();
  clean = clean.replace(/^```(json)?/i, '').replace(/```$/, '');
  return clean.trim();
};

/**
 * UNIFIED suggestion generator
 * Automatically detects context and generates appropriate suggestions
 */
export const generateSuggestions = async (
  context: SuggestionContext
): Promise<DesignSuggestion[]> => {
  const { mode, imageBase64, roomAnalysis, detectedObjects, userGoal, learningContext } = context;

  // Generate cache key based on image + mode + objects
  const imageHash = `${imageBase64.slice(0, 50)}_${imageBase64.length}`;
  const objectsHash = detectedObjects.map(o => o.name).join(',');
  const cacheKey = generateCacheKey(
    `suggestions_${mode}`,
    imageHash,
    objectsHash,
    userGoal
  );

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    // Build mode-specific prompt
    const prompt = buildPromptForMode(mode, roomAnalysis, detectedObjects, userGoal, learningContext);

    // Get cache name for reasoning model (supports caching)
    const cacheName = await getGeminiCacheName(GEMINI_CONFIG.MODELS.REASONING, true);
    
    const preset = mode === '2d-plan-style' 
      ? getPresetForOperation('SUGGESTION_2D_PLAN')
      : getPresetForOperation('SUGGESTION_3D_ROOM');
    
    const config: any = {
      responseMimeType: 'application/json',
      temperature: preset.temperature,
    };
    
    // Add cached content if available (reasoning models support caching)
    if (cacheName) {
      config.cachedContent = cacheName;
      console.log(`[Design Suggestions] Using cached context: ${cacheName}`);
    }

    const response = await ai.models.generateContent({
      model: GEMINI_CONFIG.MODELS.REASONING,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
          { text: prompt },
        ],
      },
      config,
    });

    const text = response.text;
    if (!text) return [];

    try {
      const cleanedText = cleanJson(text);
      const parsed = JSON.parse(cleanedText);
      const suggestions = Array.isArray(parsed) ? parsed : parsed.suggestions || [];

      // Style cards use preview_prompt, regular suggestions use suggested_prompt
      return suggestions
        .map((s: any, i: number) => {
          // Get prompt from either field
          const prompt = s.preview_prompt || s.suggested_prompt || '';
          if (!prompt.trim()) {
            return null; // Filter out later
          }
          return {
            id: `${mode}_${Date.now()}_${i}`,
            title: s.title || '',
            description: s.description || '',
            action_type: s.action_type || 'EDIT',
            target_object_name: s.target_object_name || 'Room',
            suggested_prompt: prompt.trim(),
            icon_hint: s.icon_hint || 'style',
            confidence: s.confidence || 0.8,
          };
        })
        .filter((s): s is DesignSuggestion => s !== null);
    } catch (e) {
      console.error('Failed to parse suggestions', e, text);
      return [];
    }
  }, cacheKey);
};

/**
 * Mode-specific prompt builder
 */
function buildPromptForMode(
  mode: SuggestionMode,
  roomAnalysis: DetailedRoomAnalysis,
  detectedObjects: IdentifiedObject[],
  userGoal: string,
  learningContext?: SuggestionContext['learningContext']
): string {
  // Learning context
  let learningSection = '';
  if (learningContext) {
    if (learningContext.stylePreferences.length > 0) {
      learningSection += `User prefers: ${learningContext.stylePreferences.slice(0, 5).join(', ')}\n`;
    }
    if (learningContext.avoidedActions.length > 0) {
      learningSection += `Avoid: ${learningContext.avoidedActions.slice(0, 3).join(', ')}\n`;
    }
    if (learningContext.contextualInsights) {
      learningSection += `Context: ${learningContext.contextualInsights}\n`;
    }
  }

  // Add learned patterns
  const learnedPatterns = getInlineContext();
  if (learnedPatterns) {
    learningSection += `\nLearned patterns:\n${learnedPatterns}\n`;
  }

  // Add operation-specific learned patterns
  const operationTypes: OperationType[] = ['MOVE', 'REMOVE', 'STYLE', 'EDIT', 'INTERNAL_MODIFY'];
  let operationPatterns = '';
  operationTypes.forEach(opType => {
    const learned = getLearnedPatternsForOperation(opType);
    if (learned.successfulPatterns.length > 0 || learned.failedPatterns.length > 0) {
      operationPatterns += `\n${opType}:\n`;
      if (learned.successfulPatterns.length > 0) {
        operationPatterns += `  ✓ Use: ${learned.successfulPatterns.slice(0, 1).join('; ')}\n`;
      }
      if (learned.failedPatterns.length > 0) {
        operationPatterns += `  ✗ Avoid: ${learned.failedPatterns.slice(0, 1).join('; ')}\n`;
      }
    }
  });
  if (operationPatterns) {
    learningSection += `\nLEARNED PROMPT PATTERNS (use successful patterns, avoid failed ones):${operationPatterns}`;
  }

  if (mode === '2d-plan-style') {
    // Floor plan style cards
    const rooms = detectedObjects?.filter(obj => 
      obj.category === 'Structure' && 
      /room|bedroom|kitchen|living|bathroom|dining|office|study/i.test(obj.name)
    ) || [];
    
    const isMultiRoom = rooms.length > 1;
    const scopeText = isMultiRoom 
      ? 'the ENTIRE floor plan (all rooms together as one cohesive design)'
      : 'this floor plan';

    return build2DPlanStylePrompt({
      scopeText,
      isMultiRoom,
      rooms,
      learningSection,
    });

  } else if (mode === '3d-room-improvement') {
    // General room improvement suggestions
    const isPlan = roomAnalysis.is_2d_plan;
    const shuffledObjects = [...detectedObjects].sort(() => 0.5 - Math.random());
    const objectsStr = shuffledObjects
      .slice(0, 8)
      .map((o) => `${o.name} (${o.category})`)
      .join(', ');

    return build3DRoomImprovementPrompt({
      userGoal,
      isPlan,
      roomType: roomAnalysis.room_type,
      objectsStr,
      learningSection,
    });
  } else {
    // Object-specific suggestions (fallback)
    return buildObjectSpecificPrompt(detectedObjects, learningSection);
  }
}

/**
 * Smart mode detection
 */
export function detectSuggestionMode(
  roomAnalysis: DetailedRoomAnalysis,
  detectedObjects: IdentifiedObject[],
  hasAppliedStyle: boolean
): SuggestionMode {
  // If it's a 2D plan and user hasn't applied style yet, show style cards
  if (roomAnalysis.is_2d_plan && !hasAppliedStyle) {
    return '2d-plan-style';
  }

  // If it's a 3D room or plan with style applied, show improvements
  return '3d-room-improvement';
}

/**
 * Backward compatibility wrappers
 */
export const generateDesignSuggestions = async (
  imageBase64: string,
  roomAnalysis: DetailedRoomAnalysis,
  detectedObjects: IdentifiedObject[],
  userGoal: string = "Improve the room's design",
  learningContext?: LearningContext
): Promise<DesignSuggestion[]> => {
  const mode = detectSuggestionMode(roomAnalysis, detectedObjects, false);
  return generateSuggestions({
    mode,
    imageBase64,
    roomAnalysis,
    detectedObjects,
    userGoal,
    learningContext: learningContext ? {
      stylePreferences: learningContext.stylePreferences || [],
      avoidedActions: learningContext.avoidedActions || [],
      contextualInsights: learningContext.contextualInsights || '',
    } : undefined,
  });
};

export const generateFloorPlanStyleCards = async (
  imageBase64: string,
  roomAnalysis: DetailedRoomAnalysis,
  detectedObjects?: IdentifiedObject[]
): Promise<FloorPlanStyle[]> => {
  // Generate cache key
  const imageHash = `${imageBase64.slice(0, 50)}_${imageBase64.length}`;
  const objectsHash = (detectedObjects || []).map(o => o.name).join(',');
  const cacheKey = generateCacheKey(
    `suggestions_2d-plan-style`,
    imageHash,
    objectsHash,
    'Visualize this floor plan'
  );

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const rooms = detectedObjects?.filter(obj => 
      obj.category === 'Structure' && 
      /room|bedroom|kitchen|living|bathroom|dining|office|study/i.test(obj.name)
    ) || [];
    
    const isMultiRoom = rooms.length > 1;
    const scopeText = isMultiRoom 
      ? 'the ENTIRE floor plan (all rooms together as one cohesive design)'
      : 'this floor plan';

    const prompt = buildPromptForMode('2d-plan-style', roomAnalysis, detectedObjects || [], 'Visualize this floor plan', undefined);

    // Get cache name for reasoning model
    const cacheName = await getGeminiCacheName(GEMINI_CONFIG.MODELS.REASONING, true);
    
    const preset = getPresetForOperation('SUGGESTION_2D_PLAN');
    const config: any = {
      responseMimeType: 'application/json',
      temperature: preset.temperature,
    };
    
    if (cacheName) {
      config.cachedContent = cacheName;
      console.log(`[Style Cards] Using cached context: ${cacheName}`);
    }

    const response = await ai.models.generateContent({
      model: GEMINI_CONFIG.MODELS.REASONING,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
          { text: prompt },
        ],
      },
      config,
    });

    const text = response.text;
    if (!text) {
      throw new Error('No response from AI for style card generation');
    }

    const cleanedText = cleanJson(text);
    let styles: any[];
    
    try {
      const parsed = JSON.parse(cleanedText);
      styles = Array.isArray(parsed) ? parsed : [];
    } catch (parseError) {
      console.error('Failed to parse style cards JSON:', parseError, cleanedText);
      throw new Error('Failed to parse style cards response');
    }

    // Validate we got styles
    if (!Array.isArray(styles) || styles.length === 0) {
      throw new Error('No styles generated from analysis');
    }

    // Ensure all required fields are present - CRITICAL: preview_prompt must exist
    const validatedStyles = styles
      .filter(s => {
        const hasPrompt = s.preview_prompt && s.preview_prompt.trim();
        if (!hasPrompt) {
          console.warn('[Style Cards] Missing preview_prompt for style:', s.name || 'unnamed');
        }
        return s.name && s.description && hasPrompt;
      })
      .map((s, i) => {
        // Ensure preview_prompt is not empty
        const prompt = s.preview_prompt?.trim() || '';
        if (!prompt) {
          console.error('[Style Cards] Empty preview_prompt for style:', s.name);
        }
        return {
          id: `style_${Date.now()}_${i}`,
          name: s.name || 'Unnamed Style',
          description: s.description || '',
          why_fits: s.why_fits || 'Analysis-based recommendation',
          confidence: typeof s.confidence === 'number' ? s.confidence : 0.7,
          preview_prompt: prompt, // Use trimmed version, don't default to empty string
          characteristics: Array.isArray(s.characteristics) ? s.characteristics : [],
        };
      });

    if (validatedStyles.length === 0) {
      console.error('[Style Cards] All styles filtered out - missing preview_prompt in response:', styles);
      throw new Error('No valid styles after validation - check that preview_prompt is generated');
    }

    // Log first style to verify prompt exists
    console.log('[Style Cards] Generated', validatedStyles.length, 'styles. First prompt:', validatedStyles[0]?.preview_prompt?.slice(0, 50));

    return validatedStyles;
  }, cacheKey);
};
