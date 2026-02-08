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
    // NEW: Spatial intelligence
    room_proportions?: string; // e.g., "Narrow galley kitchen, 8:3 aspect ratio"
    furniture_scale?: string; // e.g., "Compact furniture suitable for small spaces"
    spatial_flow?: string; // e.g., "Open plan, wide circulation paths"
  };
  current_room_analysis: {
    room_structure: string;
    existing_furniture: string[];
    spatial_constraints: string[];
    camera_angle: string;
    image_proportions: string;
    // NEW: Enhanced spatial understanding
    room_proportions?: string;
    available_space?: string; // e.g., "Limited floor space, vertical storage opportunity"
    circulation_requirements?: string; // e.g., "36\" walkway to kitchen, 18\" clearance at cabinets"
  };
  // NEW: Intelligent adaptation strategy
  spatial_adaptation?: {
    furniture_scale_adjustments: Array<{
      item: string;
      reference_size: string; // e.g., "Large sectional sofa, 120\" wide"
      target_size: string; // e.g., "Medium loveseat, 72\" wide to fit wall"
      reasoning: string; // e.g., "Reference room is 40% larger; scale furniture proportionally"
    }>;
    layout_adaptations: string[]; // e.g., ["Omit dining table - insufficient space", "Use wall-mounted desk instead of freestanding"]
    material_priorities: string[]; // e.g., ["Floor material critical for cohesion", "Wall color less important due to different proportions"]
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
  // NEW: Architect's perspective
  design_rationale?: string; // Paragraph explaining why this adaptation makes sense
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
        room_proportions: {
          type: Type.STRING,
          description: "Room size and proportions you see in Image 1 (e.g., 'Spacious 16x14 room', 'Compact galley layout'). Analyze spatial scale."
        },
        furniture_scale: {
          type: Type.STRING,
          description: "Furniture sizing relative to room in Image 1 (e.g., 'Oversized sectionals', 'Compact furniture', 'Proportional to space')"
        },
        spatial_flow: {
          type: Type.STRING,
          description: "Circulation and openness in Image 1 (e.g., 'Open plan', 'Wide walkways', 'Tight circulation')"
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
        room_proportions: {
          type: Type.STRING,
          description: "Current room size analysis (e.g., 'Narrow 12x8 space', 'Square 14x14'). Visually assess proportions."
        },
        available_space: {
          type: Type.STRING,
          description: "Space availability (e.g., 'Limited floor space', 'Open area for large furniture', 'Vertical wall space available')"
        },
        circulation_requirements: {
          type: Type.STRING,
          description: "Walkway and clearance needs (e.g., '36\" main walkway', '18\" clearance at counters', 'Doorway access preserved')"
        },
      },
      required: ['room_structure', 'existing_furniture', 'spatial_constraints', 'camera_angle', 'image_proportions'],
    },
    spatial_adaptation: {
      type: Type.OBJECT,
      properties: {
        furniture_scale_adjustments: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING, description: 'Furniture piece name' },
              reference_size: { type: Type.STRING, description: 'Size in reference room (e.g., "120\" sectional sofa")' },
              target_size: { type: Type.STRING, description: 'Appropriate size for current room (e.g., "84\" loveseat")' },
              reasoning: { type: Type.STRING, description: 'Why this scale adjustment (e.g., "Current room 40% smaller, scale proportionally")' },
            },
            required: ['item', 'reference_size', 'target_size', 'reasoning'],
          },
        },
        layout_adaptations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Layout changes needed due to space differences (e.g., "Omit coffee table - insufficient clearance")'
        },
        material_priorities: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Which materials are most important for the aesthetic (e.g., "Floor material critical", "Wall color secondary")'
        },
      },
      required: ['furniture_scale_adjustments', 'layout_adaptations', 'material_priorities'],
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
    design_rationale: {
      type: Type.STRING,
      description: 'Architect-level explanation of why this design adaptation makes sense for this specific space (2-3 sentences)'
    },
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
You are a SENIOR INTERIOR ARCHITECT and SPATIAL DESIGNER with 15+ years of experience.

EXPERTISE:
- Deep understanding of spatial proportions, furniture scale, and circulation requirements
- Ability to translate design language across different room sizes and layouts
- Architect-level reasoning about what works and what doesn't in a given space

IMAGE 1: REFERENCE STYLE (extract design language)
IMAGE 2: CURRENT ROOM (preserve geometry and layout)

CONSTRAINTS:
- Same room, same camera, same layout
- Only change materials, furniture, decor

ANALYSIS TASK (Think like a senior architect):

1. REFERENCE ROOM ANALYSIS (Image 1) - Analyze as an architect would:

   DESIGN LANGUAGE:
   - Colors you ACTUALLY SEE (e.g., "Light beige", "White", "Warm gray")
   - Materials you ACTUALLY SEE (e.g., "White painted wood", "Natural oak flooring")
   - Furniture styles you ACTUALLY SEE (e.g., "Mid-century modern dining chairs", "Minimalist light wood table")
   - Lighting characteristics (brightness, warmth, fixture styles)
   - Overall aesthetic (e.g., "Scandinavian", "Modern Minimalist")

   SPATIAL ANALYSIS:
   - Room proportions and scale (e.g., "Spacious 16x14 room", "Compact galley kitchen")
   - Furniture sizing relative to room (e.g., "Oversized sectionals dominate space", "Proportional furniture")
   - Spatial flow and circulation (e.g., "Open plan with wide walkways", "Tight circulation")

2. CURRENT ROOM ANALYSIS (Image 2) - Understand the existing space:

   STRUCTURE:
   - Room layout and proportions (visually measure width-to-depth ratio)
   - Existing furniture and their sizes
   - Spatial constraints (doorways, windows, plumbing, built-ins, clearances)
   - Camera angle and perspective
   - Available space for new furniture (wall lengths, open floor area)

   CIRCULATION REQUIREMENTS:
   - Walkway widths (estimate 36" main paths, 18" secondary clearances)
   - Access to doors, windows, appliances
   - Functional zones that must remain accessible

3. INTELLIGENT SPATIAL ADAPTATION (Critical architect reasoning):

   COMPARE ROOM SIZES:
   - Is Image 2 (current) room larger, smaller, or similar to Image 1 (reference)?
   - Estimate percentage difference (e.g., "Current room ~40% smaller than reference")

   FURNITURE SCALE ADJUSTMENTS:
   For EACH furniture piece in Image 1, determine:
   - Reference size (estimate dimensions, e.g., "120\" wide sectional sofa")
   - Will it fit in Image 2's available space?
   - If NO: Specify scaled-down alternative (e.g., "84\" loveseat to maintain proportion")
   - If YES: Keep similar size
   - Reasoning: WHY this adjustment (e.g., "Current room 40% smaller; sectional would block circulation")

   LAYOUT ADAPTATIONS:
   - Which furniture pieces won't fit? (e.g., "Omit oversized coffee table - insufficient clearance")
   - What alternatives maintain the style? (e.g., "Use nesting tables instead")
   - How to adapt placement given different wall lengths/windows?

   MATERIAL PRIORITIES:
   - Which materials are essential to the aesthetic? (e.g., "Light wood flooring critical for warmth")
   - Which can be adapted? (e.g., "Wall color less critical due to different proportions")

4. APPLICATION STRATEGY:
   Based on your spatial adaptation analysis:
   - List materials to apply (with surface locations, exact materials, finishes, colors from Image 1)
   - List furniture to add/replace (with appropriate sizing for Image 2)
   - Create placement guidelines that respect Image 2's spatial constraints
   - Specify critical elements to preserve (structural, plumbing, electrical)

5. EXECUTION INSTRUCTIONS:
   Write step-by-step instructions that:
   - Apply materials thoughtfully (not mechanically)
   - Scale furniture appropriately for THIS room size
   - Maintain design cohesion while respecting spatial constraints
   - Preserve all structural elements, camera angle, and layout

6. DESIGN RATIONALE:
   As a senior architect, explain in 2-3 sentences why this adaptation makes sense for this specific space.
   Address: scale adjustments, layout changes, material priorities, and how the design translates.

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
    return parsed;
  };

  return runWithFallback(
    () => runAnalysis(GEMINI_CONFIG.MODELS.REASONING),
    () => runAnalysis(GEMINI_CONFIG.MODELS.REASONING_FALLBACK),
    'Global Style Analysis'
  );
};

