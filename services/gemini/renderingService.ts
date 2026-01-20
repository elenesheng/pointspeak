
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

// STEP 0: LAYOUT EXTRACTION (Plan -> Symbolic Spatial Map)
// We convert 2D geometry into relative text anchors ("Left Wall", "Back Wall")
// This allows Pass 2 to place furniture correctly without seeing the confusing 2D plan image.
const analyzeLayout = async (ai: GoogleGenAI, planBase64: string): Promise<string> => {
  const prompt = `
  TASK: Analyze this 2D Floor Plan and generate a SYMBOLIC SPATIAL MAP for a 3D Perspective Render.
  
  PERSPECTIVE CONTEXT:
  - Imagine standing at the "Bottom" (Entrance) of the plan, looking "Up" (Back).
  - "Back Wall" = Top of plan.
  - "Left Wall" = Left side.
  - "Right Wall" = Right side.
  - "Front" = Bottom of plan (closest to viewer).

  ROOM TYPE INFERENCE:
  - If Bed, Kitchen, and Sofa appear in the same continuous space -> Detect as "STUDIO".
  - Otherwise, label as Bedroom, Living Room, etc.

  ANALYSIS STEPS:
  1. Identify the "Back Wall" (Top of plan).
  2. WINDOW DETECTION: Look for thin gaps or double lines along exterior walls. 
     - IF FOUND: Output MUST include Count (e.g., 1, 2), Wall (Left/Right/Back), and Width (Small/Medium/Large).
  3. TV RULE: If no TV symbol is clearly detected, DO NOT invent one.
  4. For each major object (Bed, Toilet, Tub, Sofa, Kitchen Counter), determine:
     - ANCHOR: Which wall is it touching?
     - DEPTH: Is it in the Back (Top), Middle, or Front (Bottom)?
     - ALIGNMENT: Centered, Corner, or distributed?

  CRITICAL SIZE ANALYSIS:
  - Large Oval (> 1.5m) = BATHTUB.
  - Small Oval/Circle (< 0.6m) = SINK.
  - Square with X = SHOWER.

  OUTPUT FORMAT:
  "ROOM TYPE: [Type]
  SYMBOLIC MAP:
  - [Object/Window] | [Anchor Wall] | [Depth] | [Notes]"

  Example:
  "ROOM TYPE: STUDIO
  SYMBOLIC MAP:
  - Windows | Back Wall | Back | Two large openings
  - Bed | Right Wall | Back | Headboard against wall
  - Kitchenette | Left Wall | Middle | Small linear kitchen
  - Sofa | Center | Front | Facing Back Wall"
  `;

  try {
      const response = await ai.models.generateContent({
        model: GEMINI_CONFIG.MODELS.REASONING_FALLBACK, // Use Flash for speed
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: planBase64 } },
            { text: prompt }
          ]
        },
        config: { temperature: 0.1 }
      });
      return response.text || "Room Type: Standard\nSymbolic Map: Standard room layout.";
  } catch (e) {
      console.warn("Layout analysis failed, using default.");
      return "Room Type: Standard\nSymbolic Map: Standard room layout.";
  }
};

// PASS 1: STRUCTURE GENERATION (Whitebox/Clay) - Pure Geometry Extrusion
// The MASK is the authority. The PLAN is only for scale hints.
const generateStructurePass = async (
  ai: GoogleGenAI,
  planBase64: string,
  maskBase64: string
): Promise<string> => {
  const prompt = `
  ROLE: 3D Renderer.
  TASK: Convert the provided STRUCTURAL MASK into a simple 3D interior volume (Whitebox).

  INPUTS:
  - Floor Plan (Use ONLY for wall length proportions)
  - Structural Mask (WHITE = Walls, BLACK = Empty Space) -> THIS IS THE AUTHORITY.

  GEOMETRY RULES:
  - Extrude white regions vertically to form walls.
  - Wall height: ~2.7m.
  - Do NOT invent new walls. Do NOT remove walls.
  - Do NOT render furniture.
  
  CAMERA (CRITICAL):
  - VIEW: Eye-Level Perspective (1.6m high).
  - LENS: 18mm Wide Angle.
  - LOOK: Straight into the room.
  - REQUIREMENT: Floor and Ceiling must be visible.
  - PERSPECTIVE: 3-Point perspective (verticals must be straight).

  RENDER STYLE:
  - White clay material.
  - Soft ambient occlusion.
  - Empty room shell only.
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
    config: { temperature: 0.1 }
  });
  
  return extractBase64(response);
};

// PASS 2: STYLE & LAYOUT APPLICATION
// Inputs: Whitebox (Geometry) + Symbolic Map (Layout) + Reference (Style)
// We DO NOT pass the plan image here to prevent perspective drift.
const applyStylePass = async (
  ai: GoogleGenAI,
  whiteboxBase64: string,
  symbolicMap: string,
  referenceBase64: string | null,
  styleDescription: string
): Promise<string> => {
  const whiteboxClean = whiteboxBase64.split(',')[1];
  
  const prompt = `
  ROLE: Interior Designer.
  TASK: Furnish and Texture the provided Whitebox shell using the Symbolic Map.

  INPUT 1: WHITEBOX RENDER (Geometry Authority)
  - This image defines the 3D Perspective, Room Shape, and Wall positions.
  - DO NOT CHANGE THE CAMERA ANGLE.
  - DO NOT MOVE WALLS.

  INPUT 2: SYMBOLIC SPATIAL MAP (Layout Intent)
  - "${symbolicMap}"
  - Use this text map to place 3D furniture models relative to the Whitebox walls.
  
  CAMERA & SPATIAL RULES:
  - "Left" and "Right" are from the CAMERA viewpoint (Viewer's Left/Right).
  - "Back Wall" is the wall furthest from the camera.
  - "Front" is closest to the camera.

  ABSOLUTE SCALE ANCHOR (CRITICAL):
  - A standard bed is approximately 2 meters long.
  - A standard bathtub is approximately 1.6–1.8 meters long.
  - Use these as real-world scale references to size the room.
  - Walls and room proportions must be consistent with these dimensions.

  SCALE & COMPOSITION RULES:
  - Preserve correct room scale. 
  - If multiple large furniture items compete for space: Place secondary items partially out of frame (crop them) rather than shrinking them.
  - DO NOT SHRINK furniture to fit.

  FURNITURE PRIORITY (CONSTRAINT MANAGEMENT):
  - Primary (Must Include): Bed, Sofa, Bathtub, Kitchen Counters.
  - Secondary (Crop if needed): Tables, Desks, Dressers.
  - Tertiary (Omit if tight): Chairs, Decor, Plants, Nightstands.
  - RULE: If space is constrained, omit Tertiary items and crop Secondary items. Never shrink Primary items.

  STUDIO RULES (If Room Type is STUDIO):
  - Do NOT subdivide space with imaginary walls.
  - Use zoning via furniture only (e.g. rug, sofa back).
  - Maintain open-plan feeling.

  WINDOW RULES (STRICT):
  - Windows may ONLY be added if explicitly listed in the Symbolic Map.
  - Place them on the specified wall.
  - Do NOT add windows otherwise.
  - WINDOW GEOMETRY: Windows are voids cut into the wall plane. Do NOT change wall position or thickness. Windows must be flush with the wall surface.

  TV PLACEMENT RULE:
  - Only place a TV if explicitly mentioned in the Symbolic Map.
  - Otherwise, omit it.

  ORIENTATION RULES (STRICT):
  - Beds: Headboard must be against the Anchor Wall.
  - Bathtubs: Long side parallel to the Anchor Wall.
  - Sofas: Back against wall, facing center of room.
  - Toilets: Back against wall, facing into room.
  - Kitchen Counters: Flat against wall.

  INPUT 3: STYLE REFERENCE
  - User Goal: "${styleDescription}"
  - Apply photorealistic materials/lighting matching this style.

  EXECUTION:
  1. Respect the Whitebox geometry (Walls/Floor/Ceiling) implicitly.
  2. Populate the room with furniture defined in the Symbolic Map.
  3. Render in high fidelity.
  `;

  const parts: any[] = [
    { inlineData: { mimeType: 'image/jpeg', data: whiteboxClean } },
    { text: prompt }
  ];
  
  // Only add reference if it exists
  if (referenceBase64) {
    parts.splice(1, 0, { inlineData: { mimeType: 'image/jpeg', data: referenceBase64 } });
  }

  const response = await ai.models.generateContent({
    model: GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO,
    contents: { parts },
    config: { temperature: 0.3 }
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
  
  console.log("[Render] Starting Pipeline...");
  
  try {
      // 1. Analyze Layout (Plan -> Text Map)
      console.log("[Render] Generating Symbolic Spatial Map...");
      const symbolicMap = await analyzeLayout(ai, planBase64);
      console.log("[Render] Map:", symbolicMap);

      // 2. Generate Structure Whitebox (Geometry)
      console.log("[Render] Generating Structure Whitebox...");
      const structureWhitebox = await generateStructurePass(ai, planBase64, maskBase64);
      
      // 3. Apply Style & Furniture (Text Map -> Final Image)
      console.log("[Render] Applying Style & Furniture...");
      const finalImage = await applyStylePass(
        ai, 
        structureWhitebox,
        symbolicMap, // Passing TEXT instead of IMAGE
        referenceBase64, 
        styleDescription
      );
      
      return [finalImage];

  } catch (e) {
      console.error("Render failed", e);
      throw e;
  }
};
