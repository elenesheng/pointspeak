
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { DetailedRoomAnalysis, RoomInsight } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry, generateCacheKey } from "../../utils/apiUtils";

/**
 * STRICT SCHEMA DEFINITIONS
 */
const insightItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING, description: "Category" },
    title: { type: Type.STRING, description: "Title" },
    description: { type: Type.STRING, description: "Details" },
    suggestions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "User-facing prompts to try" },
    system_instruction: { type: Type.STRING, description: "Technical Prompt Fix / Debug Code" }
  },
  required: ["category", "title", "description", "suggestions"]
};

const roomAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    room_type: { type: Type.STRING },
    is_2d_plan: { type: Type.BOOLEAN },
    traffic_flow: { type: Type.STRING },
    constraints: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          location: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["type", "location", "description"]
      }
    },
    insights: {
      type: Type.ARRAY,
      items: insightItemSchema
    }
  },
  required: ["room_type", "is_2d_plan", "constraints", "insights"]
};

const insightsWrapperSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    insights: { type: Type.ARRAY, items: insightItemSchema }
  },
  required: ["insights"]
};

export const analyzeRoomSpace = async (base64Image: string): Promise<DetailedRoomAnalysis> => {
  const cacheKey = generateCacheKey('roomAnalysis_v16_align_strict', base64Image.substring(0, 50));

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const runAnalysis = async (model: string) => {
      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: "Analyze this image. If it is a 2D floor plan, analyze its geometry first. If 3D, check for alignment/symmetry errors." },
          ],
        },
        config: {
          systemInstruction: `
            You are a Senior Architect & Visualization Specialist.
            
            GLOBAL TASK:
            1. Detect if image is "is_2d_plan" (Blueprint) or "3D Room".
            2. Identify technical constraints (walls, windows, plumbing points).
            3. Generate 4 HIGH-VALUE INSIGHTS.

            --- IF 2D FLOOR PLAN DETECTED ---
            **CRITICAL:** Do NOT output generic lists. You must analyze the specific geometry of THIS plan.
            
            STEP 1: ANALYZE GEOMETRY
            - Does it have open spaces? (Suggest: Industrial Loft, Modern Open-Plan)
            - Is it compartmentalized/cozy? (Suggest: Traditional, French Country, Cottage)
            - Does it have large glass sections/balconies? (Suggest: Coastal, Biophilic, Japandi)
            - Is it symmetrical/formal? (Suggest: Neoclassical, Mid-Century Modern)

            STEP 2: GENERATE 4 DISTINCT VISUALIZATION STYLES (Insights)
            For each style, provide:
            1. A description of why it fits the geometry.
            2. A "Master Prompt" in the suggestions that the user can copy to apply this style.
            3. A "system_instruction" that acts as a rendering preset.
            
            Example Insight Structure (Dynamic):
            - Title: "Style: [Style Name based on geometry]"
            - Description: "This layout features [Specific Geometry Element], which suits [Style] because [Reason]."
            - Suggestions: [
                "Apply [Style] Style to this plan", 
                "Render this floor plan in [Style] style with [Material] floors and realistic lighting", 
                "Visualize with [Material] details"
              ]
            - System Instruction: "CMD: TEXTURE_OVERLAY. STYLE: [NAME]. PALETTE: [COLORS]. WALLS: PRESERVE_BLACK. LIGHTING: PHOTOREALISTIC."

            --- IF 3D ROOM DETECTED ---
            - Insight 1: Design Critique & Alignment Check.
              * LOOK FOR SYMMETRY/ALIGNMENT ERRORS.
              * Example: "The Refrigerator top is not aligned with the Oven stack."
              * Suggest specific prompt: "Fix vertical alignment of the refrigerator and oven."
            - Insight 2: Lighting/Atmosphere Suggestion.
            - Insight 3: Furniture/Layout optimization.
            - Insight 4: Color Palette recommendation.
          `,
          responseMimeType: "application/json",
          responseSchema: roomAnalysisSchema, 
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from room analysis");
      
      const parsed = JSON.parse(text);
      return parsed as DetailedRoomAnalysis;
    };

    try {
      return await runAnalysis(GEMINI_CONFIG.MODELS.REASONING);
    } catch (error) {
      console.warn("Room Analysis Pro failed, retrying with fallback...", error);
      return await runAnalysis(GEMINI_CONFIG.MODELS.REASONING_FALLBACK);
    }
  }, cacheKey);
};

export const updateInsightsAfterEdit = async (base64Image: string, previousAnalysis: DetailedRoomAnalysis, editDescription: string): Promise<RoomInsight[]> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const prompt = `
  USER INTENT: "${editDescription}".
  CONTEXT: The user tried to edit this image.
  
  TASK: QUALITY ASSURANCE (QA) CHECK.
  
  Look at the image. Did it work?
  
  --- FAILURE SCENARIOS (Generate "Critique" Insight) ---
  1. "Cartoonish/Fake": The textures look drawn, not real.
     -> Generate Insight with System Instruction: 
     "CMD: ENHANCE_REALISM. PARAMS: { texture_fidelity: high, lighting: ambient_occlusion }."
     
  2. "Structural Damage": The solid black/grey walls disappeared or got colored over.
     -> Generate Insight with System Instruction:
     "CMD: RESTORE_STRUCTURE. MASK_WALLS: TRUE. COLOR: BLACK. PRIORITY: STRUCTURAL_LINES."

  3. "Perspective Shift": It turned into a 3D view but user wanted 2D plan.
     -> Generate Insight with System Instruction:
     "CMD: FORCE_ORTHOGRAPHIC. TILT: 0. ZOOM: 1.0. NO_PERSPECTIVE."
     
  4. "Alignment Error": Objects are floating or crooked.
     -> Generate Insight with System Instruction:
     "CMD: ALIGN_OBJECTS. AXIS: VERTICAL/HORIZONTAL. SNAP_TO: GRID."

  --- SUCCESS SCENARIOS ---
  - Suggest next steps (e.g., "Now add a rug", "Change the lighting").

  OUTPUT: 4 Insights (mix of QA Critique and Next Steps).
  `;

  try {
      const response = await ai.models.generateContent({
      model: GEMINI_CONFIG.MODELS.REASONING, 
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: insightsWrapperSchema 
      }
    });
    
    const text = response.text;
    if (text) {
       const parsed = JSON.parse(text);
       return parsed.insights || [];
    }
    return previousAnalysis.insights || [];
  } catch (e) {
    return previousAnalysis.insights || [];
  }
};
