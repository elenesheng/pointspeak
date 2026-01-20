
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
  ROLE: 3D Architect.
  TASK: Create a pure "Whitebox" clay render from this 2D Floor Plan.
  
  INPUTS:
  1. Floor Plan Image (Layout)
  2. Structural Mask (White = Wall, Black = Void)

  STRICT CAMERA SETTINGS:
  - HEIGHT: 1.6m (Eye Level). Standing ON THE FLOOR.
  - PITCH: 0° (Looking straight forward).
  - LENS: 16mm Wide Angle.
  - COMPOSITION: The CEILING must be visible in the top 20%. The FLOOR must be visible in the bottom 20%.
  - ERROR PREVENTION: If the image looks like a map or chart, YOU FAILED. It must look like a PHOTOGRAPH of a white room.

  SYMBOL DECODING & GEOMETRY RULES:
  1. WALLS: Extrude vertically from plan lines. Gaps are Doors/Windows.
  2. SHOWER vs SINK (CRITICAL):
     - Large Square/Quadrant with 'X' or circle = SHOWER CABIN. Render a TALL glass box (2m height).
     - Small Oval/Rectangle on wall = SINK. Render a floating basin or vanity cabinet (0.9m height).
  3. KITCHEN:
     - Long rectangles along walls = COUNTERS. Render at 0.9m height. 
     - Do not block doors with counters.
  
  PHYSICS:
  - Floor exists. Ceiling exists.
  - Furniture sits on floor.
  
  OUTPUT STYLE:
  - Material: White Clay / Plaster.
  - Lighting: Soft Ambient Occlusion (Grey shadows).
  - NO TEXTURES. NO COLORS. JUST GEOMETRY.
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
  ROLE: Texture Artist / Material Painter.
  TASK: Paint photorealistic materials onto the provided Whitebox 3D Render.

  INPUTS:
  1. WHITEBOX IMAGE (Geometry Truth):
     - This image dictates the EXACT SHAPE, POSITION, and LAYOUT of the room.
     - You CANNOT change the walls, windows, doors, or furniture shapes.
     - You CANNOT move the kitchen or bathroom fixtures.
     - You MUST respect the Whitebox geometry 100%.

  2. REFERENCE IMAGE (Style Palette ONLY):
     - This is a MOOD BOARD. 
     - IGNORE the layout of this image.
     - IGNORE the furniture placement in this image.
     - ONLY extract: Colors, Materials (e.g. "Marble", "Oak"), and Lighting vibe.

  3. USER TEXT: "${styleDescription}"

  INSTRUCTIONS:
  1. LOCK GEOMETRY: Look at Input 1. If there is a blank wall, KEEP IT BLANK. Do not add windows just because the reference has them.
  2. PAINT MATERIALS: 
     - If the Whitebox shows a Shower Cabin -> Paint it with Glass/Chrome.
     - If the Whitebox shows a Sink -> Paint it with Ceramic/Stone.
     - If the Whitebox shows a Kitchen Counter -> Paint it with the material from the Reference (e.g. Marble), but KEEP THE SHAPE from the Whitebox.
  3. INTELLIGENT MATERIAL LOGIC:
     - Wet Zones (Shower/Tub): Use Tiles/Stone.
     - Dry Zones (Living/Bed): Use Wood/Carpet/Paint.

  NEGATIVE CONSTRAINTS (DO NOT DO THIS):
  - DO NOT change the room layout.
  - DO NOT add doors or windows that are not in the Whitebox.
  - DO NOT clone the Reference Image's room.

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
    config: { temperature: 0.25 } // Low temp to prevent hallucination of new geometry
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
