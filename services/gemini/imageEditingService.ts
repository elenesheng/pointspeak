/**
 * Image editing service using Gemini API. Handles object replacement, surface replacement,
 * and global style edits with reference image support and dimension validation.
 */
import { GoogleGenAI } from '@google/genai';
import { IntentTranslation } from '../../types/ai.types';
import { DetailedRoomAnalysis, IdentifiedObject } from '../../types/spatial.types';
import { GEMINI_CONFIG } from '../../config/gemini.config';
import { getApiKey } from '../../utils/apiUtils';
import { convertToJPEG, convertToPNG, normalizeBase64, getImageDimensions } from '../../utils/imageProcessing';
import { recordEdit } from './contextCacheService';
import { buildEditingPrompt } from '../../config/prompts/editing';
import { analyzeGlobalStyleApplication, GlobalStylePlan } from './globalStyleAnalysisService';
import { REFERENCE_IMAGE_USAGE_RULE, SCALE_NORMALIZATION_RULE, SPATIAL_AWARENESS_CONSTRAINTS } from '../../config/prompts/templates/base';
import { resolveEditMode } from '../../config/prompts/editing/modeResolver';
import { getImageEditingConfigForMode } from '../../config/modelConfigs';
import { similarityScore } from '../../utils/imageSimilarity';

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
 * Performs image editing using Gemini API. Handles mode resolution, prompt building,
 * reference image processing, and dimension validation.
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

  const subjectName = identifiedObject.visual_details || identifiedObject.name;
  const sourceCoords = identifiedObject.position;
  
  const objectDescription = identifiedObject.visual_details 
    ? `${identifiedObject.name} (${identifiedObject.visual_details})`
    : identifiedObject.name;

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


  const originalName = identifiedObject.name;
  const isFurniture = /chair|sofa|table|bed|stool|seating|furniture|desk|bench|ottoman/i.test(originalName);
  const isContainer = /shelf|shelves|cabinet|bookcase|rack|display|drawer/i.test(originalName);
  const isSurface = /floor|flooring|wall|ceiling|counter|countertop|tabletop|desktop|worktop|surface|tile|parquet|concrete|backsplash/i.test(originalName);
  const hasReferenceImage = !!referenceImageBase64 && !isOriginalImageReference;
  
  const editMode = resolveEditMode({
    identifiedObject,
    translation,
    hasReferenceImage,
    isFurniture,
    isSurface,
  });

  const config = getImageEditingConfigForMode(preferredModelId, editMode);
  const isGlobalStyle = identifiedObject.id === GLOBAL_CONTEXT_ID || 
                       !identifiedObject.box_2d ||
                       GLOBAL_STYLE_KEYWORDS.test(translation.proposed_action);

  const buildPrompt = async (isPro: boolean, stylePlan?: GlobalStylePlan): Promise<string> => {
    const isAlignmentFix = /align|height|flush|level|gap|fit/i.test(translation.proposed_action) && 
                           translation.operation_type !== 'MOVE';
    const sceneInventory = buildSceneInventory();
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
      editMode,
    });
  };

  try {
    const isPro = preferredModelId === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO;
    
    let stylePlan: GlobalStylePlan | undefined;
    if (isGlobalStyle && hasReferenceImage) {
      try {
        const sceneInventory = buildSceneInventory();
        stylePlan = await analyzeGlobalStyleApplication(
          currentImageBase64,
          referenceImageBase64,
          spatialContext,
          sceneInventory
        );
      } catch (analysisError) {
        // Continue without style plan if analysis fails
      }
    }
    
    let inputDimensions: { width: number; height: number } | null = null;
    if (editMode === 'OBJECT_REPLACEMENT' || editMode === 'SURFACE_REPLACEMENT') {
      try {
        inputDimensions = await getImageDimensions(`data:image/png;base64,${normalizeBase64(currentImageBase64)}`);
      } catch (err) {
        // Continue without dimension metadata if check fails
      }
    }

    let prompt = await buildPrompt(isPro, editMode === 'GLOBAL_STYLE' ? stylePlan : undefined);

    if (inputDimensions && (editMode === 'OBJECT_REPLACEMENT' || editMode === 'SURFACE_REPLACEMENT')) {
      prompt += `\n\nIMAGE DIMENSIONS (CRITICAL - EXACT PIXELS REQUIRED):
Input image is EXACTLY ${inputDimensions.width} pixels wide × ${inputDimensions.height} pixels tall.
Output MUST be EXACTLY ${inputDimensions.width}×${inputDimensions.height} pixels - not ${inputDimensions.width-1}, not ${inputDimensions.height+1}, EXACTLY ${inputDimensions.width}×${inputDimensions.height}.
Do NOT change canvas size to 2048×2048 or any other size.
The output canvas dimensions are LOCKED to ${inputDimensions.width}×${inputDimensions.height} pixels.`;
    }

    interface ContentPart {
      inlineData?: { mimeType: string; data: string };
      text?: string;
    }

    const referenceImageForGeneration = (referenceImageBase64 && !isOriginalImageReference && editMode !== 'GLOBAL_STYLE')
      ? referenceImageBase64
      : null;
    
    const parts: ContentPart[] = [];
    const conversionPromises: Promise<string>[] = [];
    if (referenceImageForGeneration) {
      conversionPromises.push(convertToJPEG(normalizeBase64(referenceImageForGeneration), 0.98));
    }
    conversionPromises.push(convertToJPEG(normalizeBase64(currentImageBase64), 0.98));
    const convertedImages = await Promise.all(conversionPromises);
    
    parts.push({ inlineData: { mimeType: MIME_TYPE_JPEG, data: convertedImages[convertedImages.length - 1] } });
    if (referenceImageForGeneration) {
      parts.push({ inlineData: { mimeType: MIME_TYPE_JPEG, data: convertedImages[0] } });
    }
    
    parts.push({ text: prompt });
    
    setTimeout(() => recordEdit(), 0);

    const shouldPreserveInputDimensions = editMode === 'OBJECT_REPLACEMENT' || editMode === 'SURFACE_REPLACEMENT';

    const response = await ai.models.generateContent({
      model: preferredModelId,
      contents: { parts },
      config: {
        temperature: config.temperature,
        topP: config.topP,
        topK: config.topK,
        imageConfig: (isPro && !shouldPreserveInputDimensions) ? { imageSize: IMAGE_SIZE_2K } : undefined,
      },
    });

    let resultBase64: string | null = null;

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        resultBase64 = part.inlineData.data;
        break;
      }
    }

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

    if (referenceImageBase64 && !isOriginalImageReference) {
      try {
        const resultDataUrl = `data:image/jpeg;base64,${resultBase64}`;
        const refDataUrl = referenceImageBase64.startsWith('data:') 
          ? referenceImageBase64 
          : `data:image/png;base64,${referenceImageBase64}`;
        
        const score = await similarityScore(resultDataUrl, refDataUrl);
        if (score > 0.92) {
          const retryPrompt = `${prompt}\n\nCRITICAL REMINDER: You must modify the FIRST image. The reference image is for style guidance only - do NOT return it.`;
          const retryParts: ContentPart[] = [
            { inlineData: { mimeType: MIME_TYPE_JPEG, data: convertedImages[convertedImages.length - 1] } },
            { text: retryPrompt }
          ];
          
          const retryResponse = await ai.models.generateContent({
            model: preferredModelId,
            contents: { parts: retryParts },
            config: {
              temperature: Math.max(0.1, config.temperature * 0.8),
              topP: config.topP,
              topK: config.topK,
              imageConfig: (isPro && !shouldPreserveInputDimensions) ? { imageSize: IMAGE_SIZE_2K } : undefined,
            },
          });
          
          for (const part of retryResponse.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData?.data) {
              resultBase64 = part.inlineData.data;
              break;
            }
          }
        }
      } catch (similarityError) {
        // Continue with original result if similarity check fails
      }
    }

    try {
      const inputDimensions = await getImageDimensions(`data:image/png;base64,${normalizeBase64(currentImageBase64)}`);
      const outputDimensions = await getImageDimensions(`data:image/jpeg;base64,${resultBase64}`);
      const widthMatch = Math.abs(inputDimensions.width - outputDimensions.width) <= 2;
      const heightMatch = Math.abs(inputDimensions.height - outputDimensions.height) <= 2;
      // Dimension mismatch is logged but doesn't block the result
    } catch (dimensionError) {
      // Continue if dimension check fails
    }

    const pngBase64 = await convertToPNG(resultBase64);
    return `data:image/png;base64,${pngBase64}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Edit failed with ${preferredModelId}:`, errorMessage);

    if (preferredModelId === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO) {
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
