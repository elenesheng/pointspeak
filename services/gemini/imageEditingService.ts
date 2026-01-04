
import { GoogleGenAI } from "@google/genai";
import { IntentTranslation } from "../../types/ai.types";
import { DetailedRoomAnalysis, IdentifiedObject } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey } from "../../utils/apiUtils";

/**
 * Perform Image Editing.
 * Uses the Photorealistic Image Editor persona with specific prompt template.
 */
export const performImageEdit = async (
  currentImageBase64: string,
  translation: IntentTranslation,
  identifiedObject: IdentifiedObject,
  spatialContext: DetailedRoomAnalysis,
  preferredModelId: string,
  targetObject?: IdentifiedObject,
  referenceMaterialDescription?: string,
  referenceImageBase64?: string | null
): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // Subjects
  const subjectName = (translation as any).active_subject_name || identifiedObject.name;
  const subjectDesc = translation.source_visual_context || identifiedObject.visual_details || subjectName;
  const targetName = targetObject ? (targetObject.parent_structure || targetObject.name) : "Target Area";
  const targetDesc = translation.target_visual_context || (targetObject ? targetObject.visual_details : "the destination");
  const sourceCoords = identifiedObject.position;
  const targetCoords = targetObject?.position || "Target Coordinates";

  const generatePrompt = () => {
    let actionBlock = "";

    // STRICT SWAP LOGIC to prevent Hallucinations
    if (translation.operation_type === 'SWAP') {
      return `
<SYSTEM_INSTRUCTION>
You are an expert Photorealistic Image Editor.
</SYSTEM_INSTRUCTION>

<USER_PROMPT>
CRITICAL INSTRUCTION: PIXEL-PERFECT OBJECT SWAP.

OBJECT A (Currently at ${sourceCoords}):
- Name: "${subjectName}"
- Visuals: ${subjectDesc}
- Action: MOVE TO ${targetCoords}.

OBJECT B (Currently at ${targetCoords}):
- Name: "${targetName}"
- Visuals: ${targetDesc}
- Action: MOVE TO ${sourceCoords}.

EXECUTION RULES:
1. Do not distort the dimensions of Object A or B.
2. Synthesize the background behind where the objects USED to be (Inpainting).
3. Ensure lighting on both objects matches their NEW location.
</USER_PROMPT>
      `;
    } 
    
    // Standard Operations
    else if (translation.operation_type === 'MOVE') {
      actionBlock = `
   - Move "${subjectName}" to ${targetCoords}.
   - ERASE it completely from ${sourceCoords} and fill the gap with the floor/wall texture found at ${sourceCoords}.
      `;
    } else if (translation.operation_type === 'REMOVE') {
       actionBlock = `
   - Completely ERASE the "${subjectName}" at ${sourceCoords}.
   - Fill the gap with the floor/wall texture found at ${sourceCoords}.
       `;
    } else {
      // EDIT or EDIT_MATERIAL
      if (referenceImageBase64) {
          actionBlock = `
   - Apply the material visible in the REFERENCE IMAGE (inline data) to the "${subjectName}".
   - Match the perspective and lighting of the room.
   - If the reference image contains text (e.g., "Oak"), prioritize that material definition.
          `;
      } else {
          actionBlock = `
   - Modify the "${subjectName}" at ${sourceCoords} according to: ${translation.proposed_action}.
   - Match the perspective and lighting of the room.
          `;
      }
    }

    return `
<SYSTEM_INSTRUCTION>
You are an expert Photorealistic Image Editor. You will receive an input image and instructions to modify it.
</SYSTEM_INSTRUCTION>

<USER_PROMPT>
INPUT IMAGE: [Provided Image Part]
${referenceImageBase64 ? 'REFERENCE IMAGE: [Provided as Second Image Part]' : 'REFERENCE IMAGE: None'}

OPERATION: ${translation.operation_type}

INSTRUCTIONS:
1. SOURCE ANCHOR: I have identified the object at ${sourceCoords} as a "${subjectName}".
   - Visual Description: ${subjectDesc}

2. TARGET ANCHOR: I have identified the object at ${targetCoords} as a "${targetName}".
   - Visual Description: ${targetDesc}

3. ACTION:
${actionBlock}

CONSTRAINT: The result must be indistinguishable from a real photograph. Lighting and shadows must match the room's global illumination.
</USER_PROMPT>
    `;
  };

  try {
    const fullPrompt = generatePrompt();
    const isPro = preferredModelId === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO;
    
    console.log(`[${isPro ? 'PRO' : 'FLASH'}] Executing Image Edit...`);
    
    // Construct parts array (MULTIMODAL SUPPORT)
    const parts: any[] = [
      { inlineData: { mimeType: 'image/jpeg', data: currentImageBase64 } }
    ];
    
    // Push Reference Image if available (Logic for Visual Transfer)
    if (referenceImageBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: referenceImageBase64 } });
    }
    
    parts.push({ text: fullPrompt });

    const response = await ai.models.generateContent({
      model: preferredModelId,
      contents: {
        parts: parts,
      },
      config: { 
        imageConfig: isPro ? { imageSize: '2K' } : undefined,
      } 
    });

    // ROBUST RESPONSE PARSING
    // 1. Check for Direct Image Part
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) return `data:image/jpeg;base64,${part.inlineData.data}`;
    }

    // 2. Check for Base64 in Text Part (Hallucination Fix: Model sometimes returns text wrapped base64)
    const textPart = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textPart) {
      // Regex to find data:image... or a long base64 string
      const base64Match = textPart.match(/data:image\/[a-zA-Z]*;base64,([^\"]*)/);
      if (base64Match && base64Match[1]) {
        return `data:image/jpeg;base64,${base64Match[1]}`;
      }
      
      // Look for raw markdown image syntax
      const markdownMatch = textPart.match(/\!\[.*?\]\((.*?)\)/);
      if (markdownMatch && markdownMatch[1].startsWith('data:')) {
          return markdownMatch[1];
      }
    }
    
    throw new Error("No image data found in model response.");

  } catch (error: any) {
    console.warn(`Attempt with ${preferredModelId} failed. Error: ${error.message}`);

    // Fallback to Flash
    if (preferredModelId === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO) {
       console.log("Initiating Automatic Fallback to Flash...");
       try {
         const prompt = generatePrompt();
         const parts: any[] = [
            { inlineData: { mimeType: 'image/jpeg', data: currentImageBase64 } }
         ];
         if (referenceImageBase64) {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: referenceImageBase64 } });
         }
         parts.push({ text: prompt });

         const fallbackResponse = await ai.models.generateContent({
            model: GEMINI_CONFIG.MODELS.IMAGE_EDITING_FLASH,
            contents: {
              parts: parts,
            },
          });

          for (const part of fallbackResponse.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData?.data) return `data:image/jpeg;base64,${part.inlineData.data}`;
          }
       } catch (fallbackError) {
         console.error("Fallback failed.");
       }
    }

    // External Fallback (Last Resort)
    if (GEMINI_CONFIG.FLAGS.ENABLE_FALLBACK_GENERATION) {
        console.warn("Generating external fallback...");
        const simplePrompt = `Photorealistic interior design: ${translation.proposed_action} in ${spatialContext.room_type}`;
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(simplePrompt)}?width=1024&height=1024&model=flux&nologo=true`;
    }
    throw error;
  }
};
