
import { GoogleGenAI } from "@google/genai";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey } from "../../utils/apiUtils";

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

// PASS 1: STRUCTURE GENERATION (Whitebox/Clay) - Single Wide Angle View
const generateStructurePass = async (
  ai: GoogleGenAI,
  planBase64: string,
  maskBase64: string
): Promise<string> => {
  const prompt = `
  ROLE: 3D Architect & Spatial Geometry Engine.
  TASK: Generate a photorealistic INTERIOR PERSPECTIVE VIEW (Whitebox Clay Render) based on the floor plan.
  
  CRITICAL PERSPECTIVE RULES (NON-NEGOTIABLE):
  1. VIEWPOINT: You are standing ON THE FLOOR inside the room. Camera height = 1.6m (Eye Level).
  2. HORIZON: The horizon line must be in the CENTER of the image.
  3. CEILING CHECK: You MUST see the ceiling in the top 20% of the image. If you don't see the ceiling, you are too high. LOWER THE CAMERA.
  4. NO TOP-DOWN: Do not generate a map, plan, or isometric view. It must be a First-Person Photo.

  GEOMETRY DECODING RULES:
  1. WALLS (Solid Lines):
     - A SOLID BLACK LINE in the plan = A SOLID OPAQUE WALL from floor to ceiling.
     - ABSOLUTELY NO WINDOWS ON SOLID LINES. If the line is black, the wall is solid.
  
  2. DOORS (Gaps):
     - A break/gap in the black wall line = A DOORWAY or OPEN PASSAGE.
     - Render this as an opening that touches the floor.
  
  3. WINDOWS (Specific Symbols):
     - Only render a window if you see a THIN double line or a specific window symbol.
     - If you are unsure, RENDER A SOLID WALL. Do not guess windows.
  
  4. FIXTURE RULES:
     - Large Corner Square/Quadrant = SHOWER CABIN (Tall glass).
     - Small Wall Oval = SINK (Waist height).
     - Counters = Waist height boxes.

  OUTPUT STYLE:
  - Material: White Clay / Plaster.
  - Lighting: Soft Ambient Occlusion.
  - NO COLORS. NO TEXTURES. JUST FORM.
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: planBase64 } },
        { inlineData: { mimeType: 'image/png', data: maskBase64 } },
        { text: prompt }
      ]
    },
    config: { temperature: 0.1 } // Rigid adherence to plan
  });
  
  return extractBase64(response);
};

// PASS 2: STYLE APPLICATION - Texture Projection
const applyStylePass = async (
  ai: GoogleGenAI,
  whiteboxBase64: string,
  referenceBase64: string | null,
  styleDescription: string
): Promise<string> => {
  const whiteboxClean = whiteboxBase64.split(',')[1];
  
  const prompt = `
  ROLE: Texture Projection Engine.
  TASK: Apply photorealistic materials to the Input Whitebox.

  INPUT 1: WHITEBOX (THE GEOMETRY TRUTH)
  - This image defines the PHYSICS of the world.
  - If the Whitebox shows a solid wall, IT IS A SOLID WALL. Do not paint a window on it.
  - If the Whitebox shows a door, keep it a door.
  - IGNORE the Reference Image layout. ONLY use the Reference Image for colors/materials.

  INPUT 2: REFERENCE (THE VIBE)
  - Extract: "Wood floor", "Marble counter", "Beige walls".
  - Apply these materials to the SHAPES found in Input 1.

  USER INSTRUCTION: "${styleDescription}"

  STRICT MATERIAL LOGIC:
  1. WET ZONES (Showers/Tubs): Must use TILES or STONE. Never use wood inside a shower.
  2. DRY ZONES (Living/Bed): Use Wood, Carpet, or Paint.
  3. NO HALLUCINATIONS: Do not add furniture that is not in the Whitebox.

  OUTPUT:
  - A photorealistic render that matches the Whitebox's SHAPE exactly, but wears the Reference's STYLE.
  `;

  const parts: any[] = [
    { inlineData: { mimeType: 'image/jpeg', data: whiteboxClean } }
  ];
  if (referenceBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: referenceBase64 } });
  }
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO,
    contents: { parts },
    config: { temperature: 0.2 } // Low temp to prevent hallucination of new geometry
  });

  return extractBase64(response);
};

// Single angle render (internal or fallback use)
export const generateRealisticRender = async (
  planBase64: string,
  maskBase64: string,
  referenceBase64: string | null,
  styleDescription: string
): Promise<string> => {
  const result = await generateMultiAngleRender(planBase64, maskBase64, referenceBase64, styleDescription);
  return result[0];
};

// MAIN RENDER FUNCTION
export const generateMultiAngleRender = async (
  planBase64: string,
  maskBase64: string,
  referenceBase64: string | null,
  styleDescription: string
): Promise<string[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  console.log("[Render] Starting Single-View Generation...");
  
  try {
      // 1. Generate Single Wide-Angle Whitebox
      // This establishes the absolute truth for geometry.
      console.log("[Render] Generating Structure Whitebox...");
      const structureWhitebox = await generateStructurePass(ai, planBase64, maskBase64);
      
      // 2. Apply Style to the Whitebox
      console.log("[Render] Applying Style...");
      const finalImage = await applyStylePass(
        ai, 
        structureWhitebox, 
        referenceBase64, 
        styleDescription
      );
      
      // Return single image in array
      return [finalImage];

  } catch (e) {
      console.error("Render failed", e);
      throw e;
  }
};
