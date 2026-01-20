
import { GoogleGenAI, Type } from "@google/genai";
import { IntentTranslation } from "../../types/ai.types";
import { IdentifiedObject, DetailedRoomAnalysis, Coordinate } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry, runWithFallback } from "../../utils/apiUtils";

export const translateIntentWithSpatialAwareness = async (
  base64Image: string,
  userText: string,
  identifiedObject: IdentifiedObject,
  spatialContext: DetailedRoomAnalysis,
  pins: Coordinate[],
  targetObject?: IdentifiedObject,
  referenceDescription?: string
): Promise<IntentTranslation> => {
  
  const generate = async (model: string) => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const isPlan = spatialContext.is_2d_plan;

    const prompt = `
      User Request: "${userText}"
      Source Object: "${identifiedObject.name}"
      Context: ${isPlan ? "2D Floor Plan" : "3D Room"}
      ${targetObject ? `Target Location: "${targetObject.name}" at ${targetObject.position}` : ''}

      TASK: Parse Intent.

      SPECIAL RULES FOR 2D PLANS:
      - If user says "Make it alive", "Visualize", "Render", "Style":
        -> operation_type: "EDIT"
        -> proposed_action: "Render the floor plan in [Style]. Apply realistic textures to floors and furniture. Keep walls solid."
      
      STANDARD RULES:
      - MOVE: Moves the source object to the target location. This is the primary action if two points are set.
      - REMOVE: Explicitly deletes the object.
      - EDIT: Modifies style, color, or material.

      OUTPUT JSON:
      {
        "operation_type": "REMOVE" | "MOVE" | "EDIT",
        "interpreted_intent": "Brief description",
        "proposed_action": "Precise instruction for the image generator",
        "active_subject_name": "Subject Name",
        "spatial_check_required": boolean,
        "validation": { "valid": true, "warnings": [] }
      }
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
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) throw new Error("Intent translation failed");
    return JSON.parse(text) as IntentTranslation;
  };

  return withSmartRetry(async () => {
    return runWithFallback(
      () => generate(GEMINI_CONFIG.MODELS.REASONING),
      () => generate(GEMINI_CONFIG.MODELS.REASONING_FALLBACK),
      "Intent Parsing"
    );
  });
};
