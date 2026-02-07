/**
 * Reasoning-based analysis for global style edits
 * Uses Gemini's reasoning capability to analyze both images and create a detailed plan
 */

import { GoogleGenAI, Type, Schema } from '@google/genai';
import { GEMINI_CONFIG } from '../../config/gemini.config';
import { getApiKey, runWithFallback } from '../../utils/apiUtils';
import { convertToJPEG, normalizeBase64 } from '../../utils/imageProcessing';
import { DetailedRoomAnalysis } from '../../types/spatial.types';

export interface GlobalStylePlan {
  reference_analysis: {
    dominant_materials: string[];
    color_palette: string[];
    furniture_styles: string[];
    lighting_characteristics: string;
    overall_aesthetic: string;
  };
  current_room_analysis: {
    room_structure: string;
    existing_furniture: string[];
    spatial_constraints: string[];
    camera_angle: string;
    image_proportions: string;
  };
  application_strategy: {
    materials_to_apply: Array<{
      surface: string;
      material: string;
      finish: string;
      color: string;
    }>;
    furniture_to_add: string[];
    furniture_to_replace: string[];
    placement_guidelines: string[];
    critical_preservations: string[];
  };
  execution_instructions: string;
}

const globalStylePlanSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    reference_analysis: {
      type: Type.OBJECT,
      properties: {
        dominant_materials: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "Materials you ACTUALLY SEE in Image 1 (e.g., 'White painted wood', 'Light beige walls', 'Natural oak'). DO NOT default to dark colors unless visually present."
        },
        color_palette: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "Colors you ACTUALLY SEE in Image 1 (e.g., 'Light beige', 'White', 'Warm gray', 'Natural wood'). Describe what is VISUALLY PRESENT, not assumed."
        },
        furniture_styles: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "Furniture styles you ACTUALLY SEE in Image 1 (e.g., 'White dining chairs', 'Light wood table'). Describe what is VISUALLY PRESENT."
        },
        lighting_characteristics: { 
          type: Type.STRING,
          description: "Lighting you ACTUALLY SEE in Image 1 (e.g., 'Bright natural light', 'Warm ambient'). Describe what is VISUALLY PRESENT."
        },
        overall_aesthetic: { 
          type: Type.STRING,
          description: "Aesthetic you ACTUALLY SEE in Image 1 (e.g., 'Scandinavian', 'Modern Minimalist'). Based on visual observation."
        },
      },
      required: ['dominant_materials', 'color_palette', 'furniture_styles', 'lighting_characteristics', 'overall_aesthetic'],
    },
    current_room_analysis: {
      type: Type.OBJECT,
      properties: {
        room_structure: { type: Type.STRING },
        existing_furniture: { type: Type.ARRAY, items: { type: Type.STRING } },
        spatial_constraints: { type: Type.ARRAY, items: { type: Type.STRING } },
        camera_angle: { type: Type.STRING },
        image_proportions: { type: Type.STRING },
      },
      required: ['room_structure', 'existing_furniture', 'spatial_constraints', 'camera_angle', 'image_proportions'],
    },
    application_strategy: {
      type: Type.OBJECT,
      properties: {
        materials_to_apply: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              surface: { type: Type.STRING, description: 'Exact surface location (e.g., "floor", "left wall", "cabinet fronts", "countertop")' },
              material: { type: Type.STRING, description: 'Material type you ACTUALLY SEE in Image 1 (e.g., "White painted wood", "Light beige plaster"). DO NOT assume dark materials.' },
              finish: { type: Type.STRING, description: 'Finish type you ACTUALLY SEE (matte, satin, glossy, rough, etc.)' },
              color: { type: Type.STRING, description: 'Exact color you ACTUALLY SEE in Image 1 (e.g., "Light beige", "White", "Warm gray"). DO NOT default to dark colors.' },
            },
            required: ['surface', 'material', 'finish', 'color'],
          },
        },
        furniture_to_add: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "Furniture you ACTUALLY SEE in Image 1 that should be added. Describe EXACTLY what you see (e.g., 'White dining chairs', 'Light wood table'). DO NOT default to dark colors unless visually present."
        },
        furniture_to_replace: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "Existing furniture to replace with furniture you ACTUALLY SEE in Image 1. Use EXACT colors and styles from Image 1. DO NOT default to dark colors unless visually present."
        },
        placement_guidelines: { type: Type.ARRAY, items: { type: Type.STRING } },
        critical_preservations: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['materials_to_apply', 'furniture_to_add', 'furniture_to_replace', 'placement_guidelines', 'critical_preservations'],
    },
    execution_instructions: { type: Type.STRING },
  },
  required: ['reference_analysis', 'current_room_analysis', 'application_strategy', 'execution_instructions'],
};

export const analyzeGlobalStyleApplication = async (
  currentRoomImageBase64: string,
  referenceImageBase64: string,
  roomAnalysis: DetailedRoomAnalysis,
  sceneInventory: string
): Promise<GlobalStylePlan> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  // Convert images to JPEG for API
  const [currentRoomJpeg, referenceJpeg] = await Promise.all([
    convertToJPEG(normalizeBase64(currentRoomImageBase64)),
    convertToJPEG(normalizeBase64(referenceImageBase64)),
  ]);

  const analysisPrompt = `
Analyze two images and create a plan to copy visible features from Image 1 to Image 2.

IMAGE 1: REFERENCE (copy features from this)
IMAGE 2: CURRENT ROOM (preserve geometry and layout)

CONSTRAINTS:
- Same room, same camera, same layout
- Only change materials, furniture, decor

YOUR ANALYSIS TASK:

1. REFERENCE ANALYSIS (Image 1):
   List what you see:
   - Colors (e.g., "Light beige", "White", "Natural oak")
   - Materials (e.g., "White painted wood", "Light gray tile")
   - Furniture (e.g., "White dining chairs", "Light wood table")
   - Lighting (brightness, warmth)
   - Overall aesthetic

2. CURRENT ROOM ANALYSIS (Image 2):
   - Describe the room structure (layout, walls, openings)
   - List existing furniture and their positions
   - Identify spatial constraints (doorways, windows, plumbing fixtures, walkways)
   - Analyze camera angle and perspective (e.g., "Eye-level, slightly elevated, looking northeast")
   - Note image proportions and composition (e.g., "16:9 landscape, wide-angle view")

3. APPLICATION STRATEGY:
   For each material in Image 1, specify:
   - Surface location (e.g., "floor", "left wall", "cabinet fronts")
   - Material type from Image 1
   - Finish (matte, satin, glossy, etc.)
   - Exact color from Image 1
   
   List furniture from Image 1 to add and replace.
   Create placement guidelines respecting spatial constraints.

4. EXECUTION INSTRUCTIONS:
   Create step-by-step instructions to copy features from Image 1 to Image 2.
   Use the exact colors and materials listed above.
   Preserve room geometry and camera.

SCENE INVENTORY:
${sceneInventory}

ROOM ANALYSIS:
- Room Type: ${roomAnalysis.room_type}
- Traffic Flow: ${roomAnalysis.traffic_flow}
- Constraints: ${roomAnalysis.constraints.map(c => `${c.type} at ${c.location}: ${c.description}`).join('; ')}

OUTPUT: Provide JSON plan with specific colors, materials, and furniture from Image 1.
`;

  const runAnalysis = async (model: string): Promise<GlobalStylePlan> => {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: referenceJpeg } },
          { inlineData: { mimeType: 'image/jpeg', data: currentRoomJpeg } },
          { text: analysisPrompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: globalStylePlanSchema,
        temperature: 0.1, // Low temperature for accurate copying
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty response from global style analysis');

    const parsed = JSON.parse(text) as GlobalStylePlan;
    console.log('[GlobalStyleAnalysis] Plan created:', parsed);
    return parsed;
  };

  return runWithFallback(
    () => runAnalysis(GEMINI_CONFIG.MODELS.REASONING),
    () => runAnalysis(GEMINI_CONFIG.MODELS.REASONING_FALLBACK),
    'Global Style Analysis'
  );
};

