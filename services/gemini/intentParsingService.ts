
import { GoogleGenAI, Type } from "@google/genai";
import { IntentTranslation } from "../../types/ai.types";
import { IdentifiedObject, DetailedRoomAnalysis, Coordinate } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry } from "../../utils/apiUtils";

/**
 * Translate user intent into a technical execution plan.
 * Uses the PointSpeak Spatial Reasoning Engine persona.
 */
export const translateIntentWithSpatialAwareness = async (
  base64Image: string,
  userText: string,
  identifiedObject: IdentifiedObject,
  spatialContext: DetailedRoomAnalysis,
  pins: Coordinate[],
  targetObject?: IdentifiedObject
): Promise<IntentTranslation> => {
  
  const generate = async (model: string) => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    let targetInfo = "N/A";
    if (pins && pins.length === 2) {
      targetInfo = targetObject 
        ? `Object: "${targetObject.name}" (Parent: ${targetObject.parent_structure || 'Same'}) at ${targetObject.position}` 
        : "Area: Target Location (Specific Coordinate)";
    }

    const prompt = `
    INPUTS YOU WILL RECEIVE:
    1. "Room Context": ${JSON.stringify(spatialContext)}
    2. "Source Object": "${identifiedObject.name}" (Parent: ${identifiedObject.parent_structure}) at ${identifiedObject.position}.
    3. "Target Object": ${targetInfo}
    4. "User Request": "${userText}"

    YOUR RESPONSIBILITIES:
    1. OPERATION CLASSIFICATION:
       - SWAP: Exchanging two distinct objects.
       - MOVE: Relocating one object to a new spot (leaving the old spot empty).
       - REMOVE: Deleting an object and in-painting the background.
       - EDIT: Changing material, color, or texture (in-place).

    2. "SWAP" SPECIAL LOGIC:
       - If the user says "Swap this with that", you MUST memorize the visual details of BOTH objects.
       - Your output prompt must explicitly state: "Place Object A (Visuals) at Location B. Place Object B (Visuals) at Location A."
       - If you do not track both visuals, the swap will hallucinate.

    3. SAFETY & PHYSICS CHECK:
       - Gravity: Don't place heavy furniture on ceilings or flimsy shelves.
       - Flow: Don't block identified "traffic_flow" paths (doors, hallways).
       - If unsafe, set validation.valid = false and explain why.

    4. MATERIAL REFERENCE LOGIC:
       - If a reference image is provided, extracting its "material_properties" (color, texture, pattern) is your highest priority for EDIT tasks.

    OUTPUT FORMAT:
    Return ONLY raw JSON. No markdown formatting.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: prompt },
        ],
      },
      config: {
        systemInstruction: "You are PointSpeak's Spatial Reasoning Engine. Your goal is to translate user natural language into precise, safe, and physically possible image editing operations.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            operation_type: { type: Type.STRING, enum: ["REMOVE", "MOVE", "EDIT", "SWAP"] },
            interpreted_intent: { type: Type.STRING },
            proposed_action: { type: Type.STRING },
            spatial_check_required: { type: Type.BOOLEAN },
            active_subject_name: { type: Type.STRING },
            source_visual_context: { type: Type.STRING },
            target_visual_context: { type: Type.STRING },
            imagen_prompt: { type: Type.STRING },
            
            // Consolidated Fields
            validation: {
              type: Type.OBJECT,
              properties: {
                valid: { type: Type.BOOLEAN },
                warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
                alternative_suggestion: { type: Type.STRING }
              },
              required: ["valid", "warnings"]
            },
            conversational_response: { type: Type.STRING }
          },
          required: ["operation_type", "interpreted_intent", "proposed_action", "imagen_prompt", "validation", "conversational_response"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("Intent translation failed");
    return JSON.parse(text) as IntentTranslation;
  };

  return withSmartRetry(async () => {
    try {
      return await generate(GEMINI_CONFIG.MODELS.REASONING);
    } catch (error: any) {
      console.warn("Reasoning Pro failed, attempting fallback...", error);
      return await generate(GEMINI_CONFIG.MODELS.REASONING_FALLBACK);
    }
  });
};
