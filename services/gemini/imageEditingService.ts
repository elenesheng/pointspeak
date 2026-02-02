import { GoogleGenAI } from '@google/genai';
import { IntentTranslation } from '../../types/ai.types';
import { DetailedRoomAnalysis, IdentifiedObject } from '../../types/spatial.types';
import { GEMINI_CONFIG } from '../../config/gemini.config';
import { isVertexConfigured } from '../../config/vertex.config';
import { getApiKey } from '../../utils/apiUtils';
import { convertToJPEG, convertToPNG, normalizeBase64 } from '../../utils/imageProcessing';
import { generateMaskFromBoundingBox, generateCombinedMask, generateMaskAtPosition } from '../../utils/maskGeneration';
import { performImagenInpaint, removeWithImagen, insertWithImagen, ImagenInpaintResponse } from '../vertex/imagenService';
import { recordEdit } from './contextCacheService';
import { buildEditingPrompt } from '../../config/prompts/editing';

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

/**
 * Main image editing function that orchestrates Imagen (primary) and Gemini (fallback).
 */
// Learning context interface for AI behavior adjustment
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
  learningContext?: LearningContext
): Promise<string> => {

  // Try Imagen first if configured and object has bounding box
  // BUT: Skip Imagen for style transfer with reference images (Gemini handles those better)
  const preferImagen = GEMINI_CONFIG.FLAGS.PREFER_IMAGEN;
  const vertexConfigured = isVertexConfigured();
  const hasBoundingBox = !!identifiedObject.box_2d;
  const hasReferenceImage = !!referenceImageBase64 && !isOriginalImageReference;
  
  // Use Imagen for REMOVE and simple edits, but use Gemini for style transfer with reference images
  const shouldUseImagen = preferImagen && vertexConfigured && hasBoundingBox && !hasReferenceImage;

  if (shouldUseImagen) {
    try {
      console.log('[ImageEdit] Attempting Imagen inpainting...');
      const result = await performImagenEdit(
        currentImageBase64,
        translation,
        identifiedObject,
        targetObject,
        referenceMaterialDescription,
        learningContext
      );

      if (result) {
        console.log('[ImageEdit] Imagen inpainting successful');
        return result;
      }
    } catch (imagenError) {
      const errorMessage = imagenError instanceof Error ? imagenError.message : String(imagenError);
      console.warn('[ImageEdit] Imagen failed, falling back to Gemini:', errorMessage);
    }
  } else {
    // Log why Imagen isn't being used
    const reasons = [];
    if (!preferImagen) reasons.push('PREFER_IMAGEN flag is false');
    if (!vertexConfigured) reasons.push('Vertex AI not configured (set VERTEX_PROJECT_ID and VERTEX_LOCATION)');
    if (!hasBoundingBox) reasons.push('Object has no bounding box (box_2d)');
    if (hasReferenceImage) reasons.push('Reference image provided (Gemini handles style transfer better)');
    console.log(`[ImageEdit] Skipping Imagen: ${reasons.join(', ')}`);
  }

  // Fallback to Gemini
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
    learningContext
  );
};

/**
 * Performs image editing using Vertex AI Imagen with mask-based inpainting.
 * Note: Imagen is best for REMOVE operations and simple text-based edits.
 * For style transfer with reference images, Gemini is preferred.
 */
const performImagenEdit = async (
  currentImageBase64: string,
  translation: IntentTranslation,
  identifiedObject: IdentifiedObject,
  targetObject?: IdentifiedObject,
  referenceMaterialDescription?: string,
  learningContext?: LearningContext // Not used - Imagen doesn't use learning context
): Promise<string | null> => {

  const normalizedImage = normalizeBase64(currentImageBase64);

  switch (translation.operation_type) {
    case 'REMOVE':
      return performImagenRemove(normalizedImage, identifiedObject);

    case 'EDIT':
    case 'STYLE':
    case 'INTERNAL_MODIFY':
      return performImagenStyleEdit(normalizedImage, identifiedObject, translation, referenceMaterialDescription, learningContext);

    case 'MOVE':
      return performImagenMove(normalizedImage, identifiedObject, targetObject, translation, learningContext);

    case 'SWAP':
      return performImagenSwap(normalizedImage, identifiedObject, targetObject, translation);

    default:
      console.warn(`[Imagen] Unsupported operation type: ${translation.operation_type}`);
      return null;
  }
};

/**
 * REMOVE operation: Erase object and fill with background.
 */
const performImagenRemove = async (
  imageBase64: string,
  object: IdentifiedObject
): Promise<string | null> => {
  if (!object.box_2d) {
    console.warn('[Imagen] REMOVE: No bounding box available');
    return null;
  }

  const mask = await generateMaskFromBoundingBox(imageBase64, object.box_2d);
  const result = await removeWithImagen(imageBase64, mask);

  if (result.success && result.images.length > 0) {
    return `data:image/png;base64,${result.images[0]}`;
  }

  throw new Error(result.error || 'Imagen REMOVE failed');
};

/**
 * EDIT/STYLE operation: Change style/material of an object.
 * Note: Imagen doesn't support style reference images, only text prompts.
 * For operations with reference images, fall back to Gemini.
 */
const performImagenStyleEdit = async (
  imageBase64: string,
  object: IdentifiedObject,
  translation: IntentTranslation,
  referenceMaterialDescription?: string,
  learningContext?: LearningContext // Not used - Imagen doesn't use learning context
): Promise<string | null> => {
  if (!object.box_2d) {
    console.warn('[Imagen] EDIT: No bounding box available');
    return null;
  }

  const mask = await generateMaskFromBoundingBox(imageBase64, object.box_2d);

  // Build prompt from translation and reference description
  // NO LEARNING CONTEXT - Imagen learns patterns via reasoning analysis on feedback
  let prompt = translation.imagen_prompt || translation.proposed_action;
  if (referenceMaterialDescription) {
    prompt = `${prompt}. Style reference: ${referenceMaterialDescription}`;
  }

  const result = await insertWithImagen(imageBase64, mask, prompt, 75);

  if (result.success && result.images.length > 0) {
    return `data:image/png;base64,${result.images[0]}`;
  }

  throw new Error(result.error || 'Imagen EDIT failed');
};

/**
 * MOVE operation: Remove from source, insert at target (two-step).
 */
const performImagenMove = async (
  imageBase64: string,
  sourceObject: IdentifiedObject,
  targetObject?: IdentifiedObject,
  translation?: IntentTranslation,
  learningContext?: LearningContext // Not used - Imagen doesn't use learning context
): Promise<string | null> => {
  if (!sourceObject.box_2d) {
    console.warn('[Imagen] MOVE: No source bounding box available');
    return null;
  }

  // Step 1: Remove object from source location
  const sourceMask = await generateMaskFromBoundingBox(imageBase64, sourceObject.box_2d);
  const clearedResult = await removeWithImagen(imageBase64, sourceMask);

  if (!clearedResult.success || clearedResult.images.length === 0) {
    throw new Error(clearedResult.error || 'Imagen MOVE Step 1 (remove) failed');
  }

  const clearedImage = clearedResult.images[0];

  // Step 2: Insert object at target location
  let targetMask: string;

  if (targetObject?.box_2d) {
    // Use target object's bounding box
    targetMask = await generateMaskFromBoundingBox(clearedImage, targetObject.box_2d);
  } else if (targetObject?.position) {
    // Parse position string like "[x,y]" to coordinates
    const posMatch = targetObject.position.match(/\[?\s*(\d+)\s*,\s*(\d+)\s*\]?/);
    if (posMatch) {
      const targetPos = { x: parseInt(posMatch[1]), y: parseInt(posMatch[2]) };
      targetMask = await generateMaskAtPosition(clearedImage, sourceObject.box_2d, targetPos);
    } else {
      throw new Error('Invalid target position format');
    }
  } else {
    throw new Error('No target location specified for MOVE operation');
  }

  // Build prompt for insertion
  // NO LEARNING CONTEXT - Imagen learns patterns via reasoning analysis on feedback
  const prompt = sourceObject.visual_details || sourceObject.name;
  const insertResult = await insertWithImagen(clearedImage, targetMask, prompt);

  if (insertResult.success && insertResult.images.length > 0) {
    return `data:image/png;base64,${insertResult.images[0]}`;
  }

  throw new Error(insertResult.error || 'Imagen MOVE Step 2 (insert) failed');
};

/**
 * SWAP operation: Exchange positions of two objects (three-step).
 */
const performImagenSwap = async (
  imageBase64: string,
  objectA: IdentifiedObject,
  objectB?: IdentifiedObject,
  translation?: IntentTranslation
): Promise<string | null> => {
  if (!objectA.box_2d || !objectB?.box_2d) {
    console.warn('[Imagen] SWAP: Both objects need bounding boxes');
    return null;
  }

  // Step 1: Remove both objects
  const combinedMask = await generateCombinedMask(imageBase64, [objectA.box_2d, objectB.box_2d]);
  const clearedResult = await removeWithImagen(imageBase64, combinedMask);

  if (!clearedResult.success || clearedResult.images.length === 0) {
    throw new Error(clearedResult.error || 'Imagen SWAP Step 1 (remove both) failed');
  }

  let currentImage = clearedResult.images[0];

  // Step 2: Insert object A at object B's location
  const maskAtB = await generateMaskFromBoundingBox(currentImage, objectB.box_2d);
  const promptA = objectA.visual_details || objectA.name;
  const insertAResult = await insertWithImagen(currentImage, maskAtB, promptA);

  if (!insertAResult.success || insertAResult.images.length === 0) {
    throw new Error(insertAResult.error || 'Imagen SWAP Step 2 (insert A at B) failed');
  }

  currentImage = insertAResult.images[0];

  // Step 3: Insert object B at object A's location
  const maskAtA = await generateMaskFromBoundingBox(currentImage, objectA.box_2d);
  const promptB = objectB.visual_details || objectB.name;
  const insertBResult = await insertWithImagen(currentImage, maskAtA, promptB);

  if (insertBResult.success && insertBResult.images.length > 0) {
    return `data:image/png;base64,${insertBResult.images[0]}`;
  }

  throw new Error(insertBResult.error || 'Imagen SWAP Step 3 (insert B at A) failed');
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
  learningContext?: LearningContext
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

  const buildPrompt = (isPro: boolean): string => {
    // Object type detection (use original name for pattern matching)
    const originalName = identifiedObject.name;
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
      isSurface,
      isContainer,
      isAlignmentFix,
      isOriginalImageReference: isOriginalImageReference || false,
      referenceImageBase64,
      referenceMaterialDescription,
      sceneInventory,
    });
  };

  try {
    const isPro = preferredModelId === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO;
    const prompt = buildPrompt(isPro);

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
    
    // Parallel image conversion for performance
    const conversionPromises: Promise<string>[] = [];
    if (referenceImageBase64 && !isOriginalImageReference) {
      conversionPromises.push(convertToJPEG(normalizeBase64(referenceImageBase64)));
    }
    conversionPromises.push(convertToJPEG(normalizeBase64(currentImageBase64)));
    
    // Wait for all conversions in parallel
    const convertedImages = await Promise.all(conversionPromises);
    
    // Reference image comes first (Gemini processes it as style target)
    if (referenceImageBase64 && !isOriginalImageReference) {
      parts.push({ inlineData: { mimeType: MIME_TYPE_JPEG, data: convertedImages[0] } });
      parts.push({ inlineData: { mimeType: MIME_TYPE_JPEG, data: convertedImages[1] } });
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
    
    // Temperature: Lower = more deterministic, less hallucination
    let temperature: number;
    if (isInternalModify || isRemoval) {
      temperature = isPro ? TEMPERATURE_PRECISION : TEMPERATURE_FLASH_PRECISION;
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
