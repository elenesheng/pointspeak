import { GoogleGenAI, GenerateContentResponse, Part } from '@google/genai';
import { GEMINI_CONFIG } from '../../config/gemini.config';
import { getApiKey } from '../../utils/apiUtils';
import { convertToPNG, normalizeBase64 } from '../../utils/imageProcessing';
import { IdentifiedObject } from '../../types/spatial.types';
import { getPresetForOperation, IMAGE_SIZE_2K } from '../../config/modelConfigs';
import { buildRenderingSystemPrompt, getRenderingInstruction } from '../../config/prompts/rendering/structure';
import { getStage1StructurePrompt, buildStage2StylePrompt, buildStyleProjection } from '../../config/prompts/rendering/multi-stage';

interface ContentPart {
  inlineData?: { mimeType: string; data: string };
  text?: string;
}


const extractBase64 = (response: GenerateContentResponse): string => {
  const parts = response.candidates?.[0]?.content?.parts || [];
  
  // Check inline data first (preferred)
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'image/jpeg';
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }
  
  // Fallback: check text response for base64
  const textPart = parts[0]?.text;
  if (textPart) {
    const base64Match = textPart.match(/data:image\/([a-zA-Z]*);base64,([^"]*)/);
    if (base64Match?.[1] && base64Match?.[2]) {
      const mimeType = base64Match[1] || 'jpeg';
      return `data:image/${mimeType};base64,${base64Match[2]}`;
    }
  }
  
  throw new Error('No image generated.');
};

export const generateMultiAngleRender = async (
  planBase64: string,
  maskBase64: string,
  referenceBase64: string | null,
  styleDescription: string,
  detectedObjects?: IdentifiedObject[],
  isAlreadyVisualized: boolean = false
): Promise<string[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const objectContext =
    detectedObjects && detectedObjects.length > 0
      ? `\n\nDetected objects:\n${detectedObjects.map((o) => `- ${o.name} (${o.category})`).join('\n')}`
      : '';

  const systemPrompt = buildRenderingSystemPrompt({
    styleDescription,
    isAlreadyVisualized,
    referenceBase64,
    objectContext,
  });

  try {
    // Image order: Blueprint first, Aesthetic second (if exists), Mask last (THE TRUTH), Instructions after
    const parts: ContentPart[] = [
      { inlineData: { mimeType: 'image/jpeg', data: planBase64 } }, // The Blueprint
    ];

    // Add reference image if provided (second position - The Aesthetic)
    if (referenceBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: referenceBase64 } });
    }

    // Add structural mask LAST before instructions (THE TRUTH - most recent visual context)
    parts.push({ inlineData: { mimeType: 'image/png', data: maskBase64 } });

    // Instructions last (most important for Gemini - reads mask right before this)
    const instructionText = getRenderingInstruction(isAlreadyVisualized, referenceBase64);

    parts.push({ text: instructionText });

    const response = await ai.models.generateContent({
      model: GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO,
      contents: { parts },
      config: {
        systemInstruction: systemPrompt,
        temperature: getPresetForOperation('RENDER_SINGLE').temperature,
        imageConfig: { imageSize: IMAGE_SIZE_2K },
      },
    });

    const jpegImageBase64 = extractBase64(response);
    const jpegBase64 = normalizeBase64(jpegImageBase64);
    const pngBase64 = await convertToPNG(jpegBase64);
    return [`data:image/png;base64,${pngBase64}`];
  } catch (e) {
    console.error('Render failed', e);
    throw e;
  }
};

export const generateRealisticRender = async (
  planBase64: string,
  maskBase64: string,
  referenceBase64: string | null,
  styleDescription: string,
  detectedObjects?: IdentifiedObject[],
  isAlreadyVisualized: boolean = false
): Promise<string> => {
  const result = await generateMultiAngleRender(
    planBase64,
    maskBase64,
    referenceBase64,
    styleDescription,
    detectedObjects,
    isAlreadyVisualized
  );
  return result[0];
};

/**
 * Two-stage rendering for better perspective control
 * Stage 1: Generate rough 3D structure with strong perspective
 * Stage 2: Refine details and apply style
 */
export const generateMultiStageRender = async (
  planBase64: string,
  maskBase64: string,
  referenceBase64: string | null,
  styleDescription: string,
  detectedObjects?: IdentifiedObject[],
  isAlreadyVisualized: boolean = false
): Promise<string[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const objectContext =
    detectedObjects && detectedObjects.length > 0
      ? `\n\nDetected objects:\n${detectedObjects.map((o) => `- ${o.name} (${o.category})`).join('\n')}`
      : '';

  // STAGE 1: Architectural White Model (Wireframe/Clay Hybrid)
  const structurePrompt = getStage1StructurePrompt();

  // Image order: Blueprint first, Mask last (THE TRUTH), Instructions after
  const stage1Parts: ContentPart[] = [
    { inlineData: { mimeType: 'image/jpeg', data: planBase64 } }, // The Blueprint
    { inlineData: { mimeType: 'image/png', data: maskBase64 } }, // THE TRUTH (Last image before instructions)
    { text: structurePrompt }, // The Rules
  ];

  console.log('[Render] Stage 1: Generating perspective structure...');
  
  const stage1Response = await ai.models.generateContent({
    model: GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO,
    contents: { parts: stage1Parts },
      config: {
        temperature: getPresetForOperation('RENDER_STRUCTURE').temperature,
        imageConfig: { imageSize: IMAGE_SIZE_2K },
      },
  });

  const stage1Image = extractBase64(stage1Response);
  const stage1Base64 = normalizeBase64(stage1Image);

  // STAGE 2: Apply Style
  console.log('[Render] Stage 2: Applying style and details...');
  
  const stylePrompt = buildStage2StylePrompt({
    styleDescription,
    objectContext,
    referenceBase64,
  });

  // Image order: Stage 1 result first, reference second (if exists), instructions last
  const stage2Parts: ContentPart[] = [
    { inlineData: { mimeType: 'image/jpeg', data: stage1Base64 } },
  ];

  if (referenceBase64) {
    stage2Parts.push({ inlineData: { mimeType: 'image/jpeg', data: referenceBase64 } });
  }

  stage2Parts.push({ text: stylePrompt });

  const stage2Response = await ai.models.generateContent({
    model: GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO,
    contents: { parts: stage2Parts },
    config: {
      temperature: getPresetForOperation('RENDER_STYLE').temperature,
      imageConfig: { imageSize: IMAGE_SIZE_2K },
    },
  });

  const finalImage = extractBase64(stage2Response);
  const finalBase64 = normalizeBase64(finalImage);
  const pngBase64 = await convertToPNG(finalBase64);
  return [`data:image/png;base64,${pngBase64}`];
};

