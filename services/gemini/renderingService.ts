
import { GoogleGenAI } from "@google/genai";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey } from "../../utils/apiUtils";
import { IdentifiedObject } from "../../types/spatial.types";

// Helper for extracting base64
const extractBase64 = (response: any): string => {
   for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) return `data:image/jpeg;base64,${part.inlineData.data}`;
    }
    const textPart = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textPart) {
      const base64Match = textPart.match(/data:image\/[a-zA-Z]*;base64,([^\"]*)/);
      if (base64Match && base64Match[1]) return `data:image/jpeg;base64,${base64Match[1]}`;
    }
    throw new Error("No image generated.");
};

// MAIN RENDER FUNCTION
export const generateMultiAngleRender = async (
  planBase64: string,
  maskBase64: string,
  referenceBase64: string | null,
  styleDescription: string,
  detectedObjects?: IdentifiedObject[]
): Promise<string[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  console.log("[Render] Starting Constrained Visualization...");

  const objectListString = detectedObjects && detectedObjects.length > 0
    ? detectedObjects.map(o => `- ${o.name} (${o.category})`).join('\n')
    : "No specific objects detected. Detect from plan.";

  const systemPrompt = `
SYSTEM ROLE:
You are a constrained architectural visualizer.

You are operating inside a system that has already:
- Uploaded a FLOOR PLAN
- Detected rooms with exact boundaries
- Detected objects and surfaces
- Applied a 2D design style

CRITICAL AUTHORITY RULE:
You must treat detected structure as FINAL.
You are not allowed to reinterpret layout, walls, or proportions.

---

INPUTS YOU RECEIVE:

1. FULL FLOOR PLAN IMAGE (Context)
2. STRUCTURAL MASK (Authority)
   - WHITE = walls (IMMUTABLE)
   - BLACK = interior space
3. DETECTED OBJECT LIST (Ground Truth)
4. USER STYLE PROMPT

---

STRICT RULES (NON-NEGOTIABLE):

STRUCTURE:
- Do NOT move walls
- Do NOT resize rooms
- Do NOT invent doors or windows
- Do NOT remove walls

SCOPE:
- The input image is a crop of the specific room to visualize.
- Focus ENTIRELY on this space.

OBJECTS:
- Use ONLY detected objects:
${objectListString}
- Do NOT invent furniture
- Preserve relative placement
- If space is tight, allow partial cropping instead of shrinking

CAMERA:
- Interior perspective
- Eye-level (~1.6m)
- Wide lens (18–24mm)
- Camera must be INSIDE the selected room
- Floor and ceiling must be visible

STYLE:
- Apply style as MATERIALS and LIGHTING only
- Style must NOT affect geometry
- User Prompt: "${styleDescription}"

FAILURE MODE:
If instructions conflict:
1. Structural mask wins
2. Room bounding box wins
3. Detected objects win
4. User style loses

OUTPUT:
A photorealistic 3D interior image that is a faithful projection of the selected room, not a redesign.
`;

  try {
      const parts: any[] = [
        { inlineData: { mimeType: 'image/jpeg', data: planBase64 } },
        { inlineData: { mimeType: 'image/png', data: maskBase64 } },
        { text: "Generate the photorealistic render following the system rules." }
      ];
      
      // If there is a style reference image, add it
      if (referenceBase64) {
          parts.splice(1, 0, { inlineData: { mimeType: 'image/jpeg', data: referenceBase64 } });
      }

      const response = await ai.models.generateContent({
        model: GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO,
        contents: { parts },
        config: { 
            systemInstruction: systemPrompt,
            temperature: 0.2 // Low temperature for strict adherence
        }
      });
      
      const finalImage = extractBase64(response);
      return [finalImage];

  } catch (e) {
      console.error("Render failed", e);
      throw e;
  }
};

// Single angle render (internal or fallback use)
export const generateRealisticRender = async (
  planBase64: string,
  maskBase64: string,
  referenceBase64: string | null,
  styleDescription: string,
  detectedObjects?: IdentifiedObject[]
): Promise<string> => {
  const result = await generateMultiAngleRender(planBase64, maskBase64, referenceBase64, styleDescription, detectedObjects);
  return result[0];
};
