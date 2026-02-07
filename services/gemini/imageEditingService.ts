import { GoogleGenAI } from '@google/genai';
import { IntentTranslation } from '../../types/ai.types';
import { DetailedRoomAnalysis, IdentifiedObject } from '../../types/spatial.types';
import { GEMINI_CONFIG } from '../../config/gemini.config';
import { getApiKey } from '../../utils/apiUtils';
import { convertToJPEG, convertToPNG, normalizeBase64 } from '../../utils/imageProcessing';
import { recordEdit } from './contextCacheService';
import { buildEditingPrompt } from '../../config/prompts/editing';
import { analyzeGlobalStyleApplication, GlobalStylePlan } from './globalStyleAnalysisService';
import { REFERENCE_IMAGE_USAGE_RULE, SCALE_NORMALIZATION_RULE, SPATIAL_AWARENESS_CONSTRAINTS } from '../../config/prompts/templates/base';

// Constants
const GLOBAL_CONTEXT_ID = 'global_room_context';
const GLOBAL_STYLE_KEYWORDS = /room|whole|entire|global|all|redesign/i;
const CONTAINER_PATTERNS = /shelf|shelves|cabinet|bookcase|rack|display|drawer/i;
const SURFACE_PATTERNS = /counter|countertop|table|desk|worktop|surface/i;
const ALIGNMENT_PATTERNS = /align|height|flush|level|gap|fit/i;
const TEMPERATURE_PRECISION = 0.15;
const TEMPERATURE_CREATIVE = 0.4;
const TEMPERATURE_FLASH_PRECISION = 0.1;
const TEMPERATURE_FLASH_CREATIVE = 0.15;
const TOP_P = 0.85;
const TOP_K = 25;
const IMAGE_SIZE_2K = '2K';
const MIME_TYPE_JPEG = 'image/jpeg';
export interface LearningContext {
  stylePreferences: string[];
  avoidedActions: string[];
  contextualInsights: string;
  warningsForAI: string[];
}

export const performImageEdit = async (
  currentImageBase64: string,
  translation: IntentTranslation,
  identifiedObject: IdentifiedObject,
  spatialContext: DetailedRoomAnalysis,
  preferredModelId: string,
  targetObject?: IdentifiedObject,
  referenceMaterialDescription?: string,
  referenceImageBase64?: string | null,
  isOriginalImageReference?: boolean,
  allDetectedObjects?: IdentifiedObject[],
  learningContext?: LearningContext,
  onPassUpdate?: (passNumber: number, passName: string, currentImage: string) => void
): Promise<string> => {

  // Always use Gemini for image editing
  console.log('[ImageEdit] Using Gemini for image editing');
  return performGeminiEdit(
    currentImageBase64,
    translation,
    identifiedObject,
    spatialContext,
    preferredModelId,
    targetObject,
    referenceMaterialDescription,
    referenceImageBase64,
    isOriginalImageReference,
    allDetectedObjects,
    learningContext,
    onPassUpdate
  );
};


/**
 * Build focused prompt for materials pass
 */
const buildMaterialsPassPrompt = (
  stylePlan: GlobalStylePlan,
  surfaces: Array<{ surface: string; material: string; finish: string; color: string }>,
  referenceImageBase64: string
): string => {
  const surfaceList = surfaces.map(s => 
    `- ${s.surface}: Apply ${s.material} with ${s.finish} finish in ${s.color}`
  ).join('\n');

  const colorPalette = stylePlan.reference_analysis.color_palette.join(', ');

  const colorList = stylePlan.reference_analysis.color_palette.map((c, i) => `- ${c}`).join('\n');

  return `OUTPUT RULE (CRITICAL):
- The output MUST be a modification of the FIRST image provided
- NEVER output the second image or a re-creation of it
- If the second image already satisfies the request, you must still modify the first image instead

PASS 1: Apply materials from the second image to the first image.

Keep the FIRST image's camera and layout exactly as shown.
Only change materials - not furniture, decor, or structural elements.

USE ONLY THESE COLORS FROM THE SECOND IMAGE:
${colorList}

MATERIALS TO APPLY:
${surfaceList}

Apply these materials to the FIRST image's surfaces. Use only the colors listed above.
Return the FIRST image modified.`;
};

/**
 * Build focused prompt for furniture pass
 */
const buildFurniturePassPrompt = (
  stylePlan: GlobalStylePlan,
  toAdd: string[],
  toReplace: string[],
  referenceImageBase64: string
): string => {
  const addList = toAdd.map(f => `- ADD: ${f}`).join('\n');
  const replaceList = toReplace.map(f => `- REPLACE: ${f}`).join('\n');
  const furnitureStyles = stylePlan.reference_analysis.furniture_styles.join(', ');

  return `OUTPUT RULE (CRITICAL):
- The output MUST be a modification of the FIRST image provided
- NEVER output the second image or a re-creation of it
- If the second image already satisfies the request, you must still modify the first image instead

PASS 2: Apply furniture style from the second image to the first image.

Keep the FIRST image's camera and layout exactly as shown.
Preserve materials from Pass 1.
Don't block paths or plumbing.

FURNITURE FROM THE SECOND IMAGE:
${addList ? `ADD:\n${addList}\n` : ''}
${replaceList ? `REPLACE:\n${replaceList}\n` : ''}

Apply these furniture styles to the FIRST image. Use colors and styles inspired by the second image.
Return the FIRST image modified.`;
};

/**
 * Build focused prompt for decor pass
 */
const buildDecorPassPrompt = (
  stylePlan: GlobalStylePlan,
  referenceImageBase64: string
): string => {
  const lightingChar = stylePlan.reference_analysis.lighting_characteristics;
  const aesthetic = stylePlan.reference_analysis.overall_aesthetic;

  return `OUTPUT RULE (CRITICAL):
- The output MUST be a modification of the FIRST image provided
- NEVER output the second image or a re-creation of it
- If the second image already satisfies the request, you must still modify the first image instead

PASS 3: Add decor and refine lighting in the first image.

Preserve all walls, windows, doors from the FIRST image.
Preserve camera, perspective, and layout from the FIRST image exactly.
Preserve materials and furniture from previous passes.

DECOR:
- Add decorative elements inspired by the second image:
  * artwork
  * plants
  * rugs
  * accessories
- Match colors and styles from the second image
- Adapt to fit the FIRST image naturally

LIGHTING:
- Target: ${lightingChar}
- Adjust brightness and warmth to match the second image
- Preserve the FIRST image's light direction and shadows

AESTHETIC: ${aesthetic}

Return the FIRST image modified.`;
};


/**
 * Executes a single pass with focused prompt
 */
const executePass = async (
  inputImageBase64: string,
  prompt: string,
  referenceImageBase64: string,
  preferredModelId: string,
  passName: string
): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // Convert images to JPEG for API (high quality to prevent degradation)
  const [referenceJpeg, currentJpeg] = await Promise.all([
    convertToJPEG(normalizeBase64(referenceImageBase64), 0.98), // Higher quality
    convertToJPEG(normalizeBase64(inputImageBase64), 0.98), // Higher quality
  ]);

  // Add canonical rules to all passes (single source of truth)
  const fullPrompt = `${prompt}

${REFERENCE_IMAGE_USAGE_RULE}

${SCALE_NORMALIZATION_RULE}

${SPATIAL_AWARENESS_CONSTRAINTS}`;

  // CRITICAL: Current image FIRST (base), reference SECOND (style source)
  const parts = [
    { inlineData: { mimeType: MIME_TYPE_JPEG, data: currentJpeg } },
    { inlineData: { mimeType: MIME_TYPE_JPEG, data: referenceJpeg } },
    { text: fullPrompt },
  ];

  const isPro = preferredModelId === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO;
  const temperature = isPro ? 0.2 : 0.15; // Low temperature for accurate copying

  const response = await ai.models.generateContent({
    model: preferredModelId,
    contents: { parts },
    config: {
      temperature,
      topP: TOP_P,
      topK: TOP_K,
      imageConfig: isPro ? { imageSize: IMAGE_SIZE_2K } : undefined,
    },
  });

  // Extract result
  let resultBase64: string | null = null;
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      resultBase64 = part.inlineData.data;
      break;
    }
  }

  if (!resultBase64) {
    throw new Error(`${passName} failed: No image generated`);
  }

  // Convert to PNG for lossless storage
  const pngBase64 = await convertToPNG(resultBase64);
  return `data:image/png;base64,${pngBase64}`;
};

/**
 * Orchestrates multi-pass global style transfer
 * Each pass focuses on a specific transformation type
 */
const performMultiPassGlobalStyle = async (
  initialImageBase64: string,
  stylePlan: GlobalStylePlan,
  referenceImageBase64: string,
  preferredModelId: string,
  onPassUpdate?: (passNumber: number, passName: string, currentImage: string) => void
): Promise<string> => {
  console.log('[MultiPass] Starting orchestrated global style transfer');
  
  // Build pass configuration from style plan
  const hasMaterials = stylePlan.application_strategy.materials_to_apply.length > 0;
  const hasFurniture = (stylePlan.application_strategy.furniture_to_add.length > 0 || 
                        stylePlan.application_strategy.furniture_to_replace.length > 0);

  let currentImage = initialImageBase64;
  let passNumber = 0;

  // PASS 1: MATERIALS TRANSFORMATION
  if (hasMaterials) {
    passNumber++;
    const passName = `Pass ${passNumber}: Materials`;
    console.log(`[MultiPass] ${passName} (${stylePlan.application_strategy.materials_to_apply.length} surfaces)`);
    
    if (onPassUpdate) {
      onPassUpdate(passNumber, passName, currentImage);
    }
    
    const materialsPrompt = buildMaterialsPassPrompt(
      stylePlan,
      stylePlan.application_strategy.materials_to_apply,
      referenceImageBase64
    );

    try {
      currentImage = await executePass(
        currentImage,
        materialsPrompt,
        referenceImageBase64,
        preferredModelId,
        passName
      );
      console.log(`[MultiPass] ${passName} completed successfully`);
      if (onPassUpdate) {
        onPassUpdate(passNumber, passName, currentImage);
      }
    } catch (passError) {
      console.error(`[MultiPass] ${passName} failed:`, passError);
      throw new Error(`Multi-pass failed at ${passName}: ${passError instanceof Error ? passError.message : String(passError)}`);
    }
  }

  // PASS 2: FURNITURE TRANSFORMATION
  if (hasFurniture) {
    passNumber++;
    const passName = `Pass ${passNumber}: Furniture`;
    console.log(`[MultiPass] ${passName}`);
    
    if (onPassUpdate) {
      onPassUpdate(passNumber, passName, currentImage);
    }
    
    const furniturePrompt = buildFurniturePassPrompt(
      stylePlan,
      stylePlan.application_strategy.furniture_to_add,
      stylePlan.application_strategy.furniture_to_replace,
      referenceImageBase64
    );

    try {
      currentImage = await executePass(
        currentImage,
        furniturePrompt,
        referenceImageBase64,
        preferredModelId,
        passName
      );
      console.log(`[MultiPass] ${passName} completed successfully`);
      if (onPassUpdate) {
        onPassUpdate(passNumber, passName, currentImage);
      }
    } catch (passError) {
      console.error(`[MultiPass] ${passName} failed:`, passError);
      throw new Error(`Multi-pass failed at ${passName}: ${passError instanceof Error ? passError.message : String(passError)}`);
    }
  }

  // PASS 3: DECOR & LIGHTING POLISH (always enabled)
  passNumber++;
  const passName = `Pass ${passNumber}: Decor`;
  console.log(`[MultiPass] ${passName}`);
  
  if (onPassUpdate) {
    onPassUpdate(passNumber, passName, currentImage);
  }
  
  const decorPrompt = buildDecorPassPrompt(
    stylePlan,
    referenceImageBase64
  );

  try {
    currentImage = await executePass(
      currentImage,
      decorPrompt,
      referenceImageBase64,
      preferredModelId,
      passName
    );
    console.log(`[MultiPass] ${passName} completed successfully`);
    if (onPassUpdate) {
      onPassUpdate(passNumber, passName, currentImage);
    }
  } catch (passError) {
    console.error(`[MultiPass] ${passName} failed:`, passError);
    throw new Error(`Multi-pass failed at ${passName}: ${passError instanceof Error ? passError.message : String(passError)}`);
  }

  console.log(`[MultiPass] Completed ${passNumber} passes successfully`);
  return currentImage;
};

/**
 * Performs image editing using Gemini (fallback method).
 * This is the original implementation preserved as fallback.
 * ALL YOUR EXISTING PROMPTS ARE KEPT HERE - NO CHANGES
 */
const performGeminiEdit = async (
  currentImageBase64: string,
  translation: IntentTranslation,
  identifiedObject: IdentifiedObject,
  spatialContext: DetailedRoomAnalysis,
  preferredModelId: string,
  targetObject?: IdentifiedObject,
  referenceMaterialDescription?: string,
  referenceImageBase64?: string | null,
  isOriginalImageReference?: boolean,
  allDetectedObjects?: IdentifiedObject[],
  learningContext?: LearningContext,
  onPassUpdate?: (passNumber: number, passName: string, currentImage: string) => void
): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // Use visual details if available (more specific for Gemini image model)
  // Fallback to name if visual_details not available
  const subjectName = identifiedObject.visual_details || identifiedObject.name;
  const sourceCoords = identifiedObject.position;
  
  // Get object description for better context
  const objectDescription = identifiedObject.visual_details 
    ? `${identifiedObject.name} (${identifiedObject.visual_details})`
    : identifiedObject.name;

  // Build scene inventory for AI context
  const buildSceneInventory = (): string => {
    if (!allDetectedObjects || allDetectedObjects.length === 0) {
      return '';
    }

    const objectList = allDetectedObjects
      .filter(obj => obj.name && obj.box_2d)
      .map(obj => {
        const [ymin, xmin, ymax, xmax] = obj.box_2d!;
        const centerX = Math.round((xmin + xmax) / 2);
        const centerY = Math.round((ymin + ymax) / 2);
        return `- "${obj.name}" (${obj.category}) at position [${centerX}, ${centerY}], bounds: [${ymin}, ${xmin}, ${ymax}, ${xmax}]`;
      })
      .join('\n');

    return `
SCENE INVENTORY (All detected objects with their positions):
${objectList}

Use this inventory to identify the EXACT objects mentioned in the edit request. Match object names from the user's request to objects in this list.
`;
  };

  /**
   * FINAL CORRECTED APPROACH
   *
   * Combines:
   * 1. Your aspect ratio preservation (ESSENTIAL - you were right)
   * 2. Your alignment/carpenter mode logic (ESSENTIAL - you were right again)
   * 3. Cleaner language without CAPS (my contribution)
   * 4. Operation-specific prompts (my contribution)
   */

  const buildPrompt = async (isPro: boolean, stylePlan?: GlobalStylePlan): Promise<string> => {
    // Object type detection (use original name for pattern matching)
    const originalName = identifiedObject.name;
    const isFurniture = /chair|sofa|table|bed|stool|seating|furniture/i.test(originalName);
    const isContainer = /shelf|shelves|cabinet|bookcase|rack|display|drawer/i.test(originalName);
    const isSurface = /counter|countertop|table|desk|worktop|surface/i.test(originalName);
    
    // Alignment edit detection (only for fix/align operations, NOT for moves)
    const isAlignmentFix = /align|height|flush|level|gap|fit/i.test(translation.proposed_action) && 
                           translation.operation_type !== 'MOVE';

    // Check if this is a global/room-wide style change
    const isGlobalStyle = identifiedObject.id === GLOBAL_CONTEXT_ID || 
                         !identifiedObject.box_2d ||
                         GLOBAL_STYLE_KEYWORDS.test(translation.proposed_action);

    // Scene inventory
    const sceneInventory = buildSceneInventory();

    // Build prompt using centralized prompt builder
    return buildEditingPrompt({
      objectDescription,
      sourceCoords,
      translation,
      identifiedObject,
      targetObject,
      isGlobalStyle,
      isFurniture,
      isSurface,
      isContainer,
      isAlignmentFix,
      isOriginalImageReference: isOriginalImageReference || false,
      referenceImageBase64,
      referenceMaterialDescription,
      sceneInventory,
      stylePlan,
    });
  };

  try {
    const isPro = preferredModelId === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO;
    
    // Check if this is a global style edit with reference image - use reasoning analysis
    const isGlobalStyle = identifiedObject.id === GLOBAL_CONTEXT_ID || 
                         !identifiedObject.box_2d ||
                         GLOBAL_STYLE_KEYWORDS.test(translation.proposed_action);
    const hasReferenceImage = !!referenceImageBase64 && !isOriginalImageReference;
    
    
    let stylePlan: GlobalStylePlan | undefined;
    if (isGlobalStyle && hasReferenceImage) {
      console.log('[ImageEdit] Performing reasoning-based analysis for global style edit...');
      try {
        const sceneInventory = buildSceneInventory();
        stylePlan = await analyzeGlobalStyleApplication(
          currentImageBase64,
          referenceImageBase64,
          spatialContext,
          sceneInventory
        );
        console.log('[ImageEdit] Reasoning analysis complete');
        
        // Use single-pass for global style (3-pass disabled - simpler and more reliable)
        console.log('[ImageEdit] Using single-pass for global style application');
      } catch (analysisError) {
        console.warn('[ImageEdit] Reasoning analysis failed, proceeding without plan:', analysisError);
        // Continue without plan - prompt will still work
      }
    }
    
    const prompt = await buildPrompt(isPro, stylePlan);

    console.log('[ImageEdit] Editing...');

    // Prepare images for API - PARALLEL conversion for performance
    // LOSSLESS INTERMEDIATES: currentImageBase64 is PNG (lossless) from store
    // Only convert to JPEG right before API call to prevent compression artifacts
    interface ContentPart {
      inlineData?: { mimeType: string; data: string };
      text?: string;
    }

    // Build parts array - reference image FIRST for better style application
    const parts: ContentPart[] = [];
    
    // Parallel image conversion for performance (high quality to prevent degradation)
    const conversionPromises: Promise<string>[] = [];
    if (referenceImageBase64 && !isOriginalImageReference) {
      conversionPromises.push(convertToJPEG(normalizeBase64(referenceImageBase64), 0.98)); // Higher quality
    }
    conversionPromises.push(convertToJPEG(normalizeBase64(currentImageBase64), 0.98)); // Higher quality
    
    // Wait for all conversions in parallel
    const convertedImages = await Promise.all(conversionPromises);
    
    // Current image FIRST (base), reference SECOND (style guide)
    if (referenceImageBase64 && !isOriginalImageReference) {
      parts.push({ inlineData: { mimeType: MIME_TYPE_JPEG, data: convertedImages[1] } }); // CURRENT
      parts.push({ inlineData: { mimeType: MIME_TYPE_JPEG, data: convertedImages[0] } }); // REFERENCE
    } else {
      parts.push({ inlineData: { mimeType: MIME_TYPE_JPEG, data: convertedImages[0] } });
    }
    
    // Prompt comes last
    parts.push({ text: prompt });
    
    // Record edit asynchronously (non-blocking) after starting API call
    // This is just for cache refresh counting, doesn't affect the edit
    setTimeout(() => recordEdit(), 0);

    // Execute with model-appropriate settings
    // LOWERED temperatures across the board to prevent hallucinations (logo generation, etc.)
    const isInternalModify = translation.operation_type === 'INTERNAL_MODIFY';
    const isRemoval = translation.operation_type === 'REMOVE';
    const isGlobalStyleWithReference = isGlobalStyle && hasReferenceImage;
    
    // Temperature: Lower = more deterministic, less hallucination
    // Higher temperature for global style edits to encourage comprehensive transformations
    let temperature: number;
    if (isInternalModify || isRemoval) {
      temperature = isPro ? TEMPERATURE_PRECISION : TEMPERATURE_FLASH_PRECISION;
    } else if (isGlobalStyleWithReference) {
      // Higher creativity for global style edits to encourage comprehensive changes
      temperature = isPro ? 0.2 : 0.15; // Low temperature for accurate reference copying
    } else {
      temperature = isPro ? TEMPERATURE_CREATIVE : TEMPERATURE_FLASH_CREATIVE;
    }

    // Generate content - use inline context (cachedContent not supported for image models)
    const response = await ai.models.generateContent({
      model: preferredModelId,
      contents: { parts },
      config: {
        temperature,
        topP: TOP_P,
        topK: TOP_K,
        imageConfig: isPro ? { imageSize: IMAGE_SIZE_2K } : undefined,
      },
    });

    // Extract the generated image
    let resultBase64: string | null = null;

    // Check inline data first
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        resultBase64 = part.inlineData.data;
        break;
      }
    }

    // Fallback: check text response
    if (!resultBase64) {
      const textPart = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textPart) {
        const base64Match = textPart.match(/data:image\/[a-zA-Z]*;base64,([^\"]*)/);
        if (base64Match?.[1]) {
          resultBase64 = base64Match[1];
        }
      }
    }

    if (!resultBase64) {
      throw new Error('No image generated in response');
    }

    // LOSSLESS STORAGE: Convert API result to PNG for lossless intermediate storage
    // This prevents JPEG re-encoding artifacts from accumulating across edits
    // The PNG is stored in the version history and used as input for the next edit
    const pngBase64 = await convertToPNG(resultBase64);
    return `data:image/png;base64,${pngBase64}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Edit failed with ${preferredModelId}:`, errorMessage);

    // Fallback to Flash model if Pro fails
    if (preferredModelId === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO) {
      console.log('Attempting fallback to Flash model...');
      return performGeminiEdit(
        currentImageBase64,
        translation,
        identifiedObject,
        spatialContext,
        GEMINI_CONFIG.MODELS.IMAGE_EDITING_FLASH,
        targetObject,
        referenceMaterialDescription,
        referenceImageBase64,
        isOriginalImageReference
      );
    }

    throw new Error(`Image edit failed: ${errorMessage}`);
  }
};
