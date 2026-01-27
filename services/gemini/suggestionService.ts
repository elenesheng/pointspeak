
import { GoogleGenAI } from "@google/genai";
import { DetailedRoomAnalysis, IdentifiedObject } from "../../types/spatial.types";
import { DesignSuggestion } from "../../types/ai.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry } from "../../utils/apiUtils";

const cleanJson = (text: string): string => {
  let clean = text.trim();
  clean = clean.replace(/^```(json)?/i, '').replace(/```$/, '');
  return clean.trim();
};

export const generateDesignSuggestions = async (
  imageBase64: string,
  roomAnalysis: DetailedRoomAnalysis,
  detectedObjects: IdentifiedObject[],
  userGoal: string = "Improve the room's design",
  learningContext?: {
    stylePreferences?: string[];
    avoidedActions?: string[];
    contextualInsights?: string;
  }
): Promise<DesignSuggestion[]> => {
  // Timestamp ensures fresh results on re-roll
  const cacheKey = `suggestions_${imageBase64.length}_${userGoal}_${Math.floor(Date.now() / 1000)}`; 
  const isPlan = roomAnalysis.is_2d_plan;
  
  const stylePreferences = learningContext?.stylePreferences || [];
  const avoidedActions = learningContext?.avoidedActions || [];
  const contextualInsights = learningContext?.contextualInsights || '';

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    // Shuffle objects to encourage variety
    const shuffledObjects = [...detectedObjects].sort(() => 0.5 - Math.random());
    const objectsStr = shuffledObjects.slice(0, 8).map(o => `${o.name} (${o.category})`).join(', ');
    
    const prompt = isPlan ? `
    ROLE: Expert Architectural & Space Planning Consultant with deep understanding of structural constraints.
    CONTEXT: User has uploaded a 2D FLOOR PLAN.
    TASK: Analyze the floor plan geometry, alignment, walls, rooms, and space to provide intelligent suggestions.
    GOAL: "${userGoal}"

    CRITICAL ANALYSIS REQUIREMENTS:
    1. FLOOR PLAN GEOMETRY ANALYSIS:
       - Analyze room proportions, alignment, and spatial relationships
       - Identify open spaces vs. compartmentalized areas
       - Detect symmetry, formality, and flow patterns
       - Assess natural light sources (windows, openings)
       - Evaluate traffic flow and functional zones

    2. STRUCTURAL CONSTRAINTS (CRITICAL - NEVER VIOLATE):
       - KITCHEN: Plumbing fixtures (sink, dishwasher) CANNOT be moved. Walls with plumbing are structural.
       - BATHROOM: All plumbing (toilet, sink, shower) CANNOT be relocated. These walls are load-bearing.
       - Identify load-bearing walls vs. non-load-bearing partitions
       - Respect HVAC, electrical, and structural requirements

    3. INTELLIGENT SUGGESTIONS BASED ON ANALYSIS:
       - If open space detected: Suggest styles that enhance openness (Modern, Industrial, Minimalist)
       - If compartmentalized: Suggest cozy styles (Traditional, Cottage, French Country)
       - If large windows/glass: Suggest light-enhancing styles (Coastal, Biophilic, Japandi)
       - If symmetrical/formal: Suggest structured styles (Neoclassical, Mid-Century Modern)
       - Wall removal suggestions ONLY for non-load-bearing, non-plumbing walls
       - Suggest optimal room functions based on size and location

    4. STYLE ANTICIPATION:
       - Based on geometry, anticipate which styles would work best
       - Consider room size, shape, and natural features
       - Suggest complementary color palettes and materials

    ${learningContext ? `USER LEARNING CONTEXT: ${learningContext}` : ''}
    ${stylePreferences.length > 0 ? `User prefers these styles: ${stylePreferences.join(', ')}` : ''}
    ${avoidedActions.length > 0 ? `Avoid these actions: ${avoidedActions.slice(0, 3).join('; ')}` : ''}

    SUGGESTION TYPES FOR PLANS:
    1. Structural Mod (ONLY non-critical walls): "Remove non-load-bearing wall between X and Y"
    2. Visualization Style (geometry-appropriate): "Visualize in [Style] style - this layout's [geometry feature] suits this style because..."
    3. Layout Optimization: "Add [element] to improve [function] in this [room type]"
    4. Room Function Optimization: "Convert [room] to [function] - this space is ideal because..."

    OUTPUT JSON SCHEMA:
    [
      {
        "title": "Short Title",
        "description": "Why this change works for this layout.",
        "action_type": "EDIT",
        "target_object_name": "Structure", 
        "suggested_prompt": "Precise prompt to generate the visualization or edit",
        "icon_hint": "layout" | "style" | "remove"
      }
    ]
    ` : `
    ROLE: Expert Interior Design Consultant with deep aesthetic analysis capabilities.
    CONTEXT: 3D ROOM PHOTO.
    TASK: Analyze the room's current style, color palette, materials, lighting, and spatial relationships. Provide 6 intelligent, personalized design suggestions.
    GOAL: "${userGoal}"
    
    DEEP STYLE ANALYSIS REQUIRED:
    1. CURRENT STYLE ASSESSMENT:
       - Identify existing style (Modern, Traditional, Eclectic, etc.)
       - Analyze color palette and harmony
       - Assess material choices and textures
       - Evaluate lighting quality and atmosphere
       - Note spatial relationships and flow

    2. ROOM CONTEXT:
       - Room Type: ${roomAnalysis.room_type}
       - Key Objects: ${objectsStr}
       - Current constraints and opportunities

    3. PERSONALIZED SUGGESTIONS:
       ${learningContext ? `USER LEARNING CONTEXT: ${learningContext}` : ''}
       ${stylePreferences.length > 0 ? `User prefers: ${stylePreferences.join(', ')}. Incorporate these preferences naturally.` : ''}
       ${avoidedActions.length > 0 ? `Avoid: ${avoidedActions.slice(0, 3).join('; ')}` : ''}
       - Base suggestions on actual room analysis, not generic templates
       - Consider how suggestions complement existing style
       - Suggest improvements that enhance the room's character

    DIVERSITY RULES (Generate 6 items):
    1. Material Swap (e.g. Velvet to Leather)
    2. Layout/removal (e.g. Declutter X)
    3. Lighting/Atmosphere
    4. Color Palette Shift
    5. Bold Statement Piece
    6. Architectural/Structural Tweak
    
    CONSTRAINTS:
    - Do NOT suggest impossible moves.
    - Focus on visual impact.
    
    OUTPUT JSON SCHEMA:
    [
      {
        "title": "Short Title",
        "description": "One sentence explaining why.",
        "action_type": "EDIT" | "MOVE" | "REMOVE",
        "target_object_name": "Exact name from detected objects if possible, or new object",
        "suggested_prompt": "Precise instruction for image generation",
        "icon_hint": "style" | "layout" | "remove" | "color"
      }
    ]
    `;

    const response = await ai.models.generateContent({
      model: GEMINI_CONFIG.MODELS.REASONING,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        temperature: 0.85, 
      }
    });

    const text = response.text;
    if (!text) return [];

    try {
      const cleanedText = cleanJson(text);
      const suggestions = JSON.parse(cleanedText);
      return suggestions.map((s: any, i: number) => ({
        id: `sugg_${Date.now()}_${i}`,
        title: s.title,
        description: s.description,
        action_type: s.action_type,
        target_object_name: s.target_object_name,
        suggested_prompt: s.suggested_prompt,
        icon_hint: s.icon_hint,
        confidence: 0.9
      }));
    } catch (e) {
      console.error("Failed to parse suggestions", e, text);
      return [];
    }
  }, cacheKey);
};
