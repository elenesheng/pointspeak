
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
  userGoal: string = "Improve the room's design"
): Promise<DesignSuggestion[]> => {
  // Timestamp ensures fresh results on re-roll
  const cacheKey = `suggestions_${imageBase64.length}_${userGoal}_${Math.floor(Date.now() / 1000)}`; 
  const isPlan = roomAnalysis.is_2d_plan;

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    // Shuffle objects to encourage variety
    const shuffledObjects = [...detectedObjects].sort(() => 0.5 - Math.random());
    const objectsStr = shuffledObjects.slice(0, 8).map(o => `${o.name} (${o.category})`).join(', ');
    
    const prompt = isPlan ? `
    ROLE: Architectural Visualization Consultant.
    CONTEXT: User has uploaded a 2D FLOOR PLAN.
    TASK: Provide 6 suggestions to visualize, modify, or style this plan.
    GOAL: "${userGoal}"

    SUGGESTION TYPES FOR PLANS:
    1. Structural Mod (e.g., "Remove wall between Kitchen and Dining")
    2. Visualization Style (e.g., "Visualize in Mid-Century Modern style")
    3. Layout Change (e.g., "Add a kitchen island")
    4. Room Function (e.g., "Convert small room to Home Office")

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
    ROLE: Interior Design Consultant.
    CONTEXT: 3D ROOM PHOTO.
    TASK: Provide 6 diverse, concrete design suggestions.
    GOAL: "${userGoal}"
    
    CONTEXT:
    - Room Type: ${roomAnalysis.room_type}
    - Key Objects: ${objectsStr}
    
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
