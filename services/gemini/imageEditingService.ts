
import { GoogleGenAI } from "@google/genai";
import { IntentTranslation } from "../../types/ai.types";
import { DetailedRoomAnalysis, IdentifiedObject } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey } from "../../utils/apiUtils";

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
  
  // 1. Initialize Client
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // 2. Prepare Context Variables
  const subjectName = identifiedObject.name;
  const sourceCoords = identifiedObject.position;
  
  // 3. Helper: Build Strict Prompt using User's Template
  const buildStrictPrompt = (additionalInstructions: string = "") => {
    return `Output must have the same width, height, and aspect ratio as Image 1. Do not resize or crop anything.

INSTRUCTION:
- Apply only this action to the target object.
- Leave everything else unchanged.
- Verify dimension integrity.

STRICT SYSTEM RULES (HIGHEST PRIORITY):
1. **RESOLUTION PRESERVATION:** The output must be indistinguishable from the original in unedited areas. Do NOT downscale, blur, or denoise background objects.
2. **TEXTURE FIDELITY:** Preserve the "Sensor Noise" and "Film Grain" of the original photo. Do not smooth out stainless steel (ovens, fridges) or glass surfaces. They must look photographic, not like 3D plastic.
3. **MATERIAL ISOLATION:** 
   - If applying WOOD texture: Apply ONLY to Floor/Cabinets. NEVER apply wood grain to Glass, Ovens, Windows, or Sinks.
   - If applying GLASS/METAL: Must be smooth, reflective, and grain-free.

TASK:
Modify only the object described below using the provided reference image if applicable.

PRESERVE:
- All scene elements outside the subject boundary exactly as in Image 1.
- Specifically protect: Appliances (Ovens, Coffee Machines), Glass Windows, and Reflections.

TARGET:
Object: "${subjectName}"
Location: ${sourceCoords}

INSTRUCTION:
${translation.proposed_action}
${additionalInstructions}

${referenceImageBase64 ? `REFERENCE MATERIAL:
Use only as a texture source, warped to match perspective.
Do not replace surrounding background.
Only modify the target object inside its original mask.` : ''}

OUTPUT REQUIREMENTS:
- High Resolution (2K).
- No hallucinated content beyond the object.

END
Follow the original image content exactly. Where uncertain, preserve the original pixel.`;
  };

  // 4. Define the "Anti-Hallucination" Prompt for Flash
  const generateFlashPrompt = () => {
    let specificInstr = "";
    if (translation.operation_type === 'REMOVE') {
       specificInstr = "INSTRUCTION: Erase object. Fill with background to match surroundings seamlessly.";
    }
    return buildStrictPrompt(specificInstr);
  };

  // 5. Define the Pro Prompt
  const generateProPrompt = () => {
    // Determine edit type for constraint logic
    const isStructuralEdit = translation.operation_type === 'MOVE' || 
                             /align|height|fit|resize|fill|gap|structure|cabinet/i.test(translation.proposed_action);

    let modeInstructions = "";
    // CONSTRAINT LOGIC
    if (isStructuralEdit) {
       modeInstructions = `
       MODE: ARCHITECTURAL_CORRECTION (CARPENTER MODE)
       - TASK: Fix the alignment/height of the "${subjectName}".
       - PROBLEM: If the target object is shorter than the reference (e.g., trying to align an Oven with a taller Fridge), DO NOT STRETCH the appliance.
       - SOLUTION: ADD FILLER MATERIALS. You must generate new cabinetry, trim, wooden panels, or "filler strips" (charcho) above or below the object to fill the gap.
       - GOAL: Create a continuous "Visual Line" at the top and bottom.
       - PROTECTED: Keep the appliance itself realistic (standard size). Only modify the Cabinetry around it.
       `;
    } else {
       modeInstructions = `
       MODE: SURFACE_EDIT
       - STRICT CONSTRAINT: PRESERVE ALL GEOMETRY. Only change pixels inside target boundary.
       - NEIGHBOR PROTECTION: Change ONLY the "${subjectName}" at ${sourceCoords}.
       `;
    }

    return buildStrictPrompt(modeInstructions);
  };

  try {
    const isPro = preferredModelId === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO;
    const fullPrompt = isPro ? generateProPrompt() : generateFlashPrompt();
    
    console.log(`[${preferredModelId}] Executing Edit...`);

    // 6. Prepare Payload (Base64 Mode)
    const parts: any[] = [
      { inlineData: { mimeType: 'image/jpeg', data: currentImageBase64 } }
    ];
    if (referenceImageBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: referenceImageBase64 } });
    }
    parts.push({ text: fullPrompt });

    // 7. Execute with Specific Configs
    const response = await ai.models.generateContent({
      model: preferredModelId,
      contents: { parts },
      config: { 
        // CRITICAL: Maximized quality settings
        temperature: isPro ? 0.3 : 0.15, 
        topP: 0.95, // Increased from 0.9 to encourage richer detail
        topK: 40,
        // FORCE 2K RESOLUTION: Essential to prevent blur compounding
        imageConfig: isPro ? { imageSize: '2K' } : undefined 
      } 
    });

    // 8. Extract Image
    // Check inline data first
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) return `data:image/jpeg;base64,${part.inlineData.data}`;
    }

    // Check text for embedded base64 (fallback)
    const textPart = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textPart) {
      const base64Match = textPart.match(/data:image\/[a-zA-Z]*;base64,([^\"]*)/);
      if (base64Match && base64Match[1]) return `data:image/jpeg;base64,${base64Match[1]}`;
    }
    
    throw new Error("No image generated.");

  } catch (error: any) {
    console.warn(`Edit failed with ${preferredModelId}: ${error.message}`);
    
    // Fallback Logic: If Pro fails, try Flash
    if (preferredModelId === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO) {
       console.log("Falling back to Flash...");
       return performImageEdit(
         currentImageBase64, translation, identifiedObject, spatialContext, 
         GEMINI_CONFIG.MODELS.IMAGE_EDITING_FLASH, // Switch model
         targetObject, referenceMaterialDescription, referenceImageBase64
       );
    }
    throw error;
  }
};
