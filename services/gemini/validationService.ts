
import { GoogleGenAI, Type } from "@google/genai";
import { SpatialValidation, IntentTranslation } from "../../types/ai.types";
import { DetailedRoomAnalysis } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry } from "../../utils/apiUtils";

/**
 * Validate if the proposed action violates constraints.
 * Implements Fallback: Pro -> Flash
 */
export const validateSpatialChange = async (
  translation: IntentTranslation,
  spatialContext: DetailedRoomAnalysis
): Promise<SpatialValidation> => {
  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const runValidation = async (model: string) => {
      const prompt = `Review this action: ${translation.operation_type} - ${translation.proposed_action}.
      Room Constraints: ${JSON.stringify(spatialContext.constraints)}.
      Traffic Flow: ${spatialContext.traffic_flow}.
      Is this safe? Be strict on blocking paths.`;

      const response = await ai.models.generateContent({
        model: model,
        contents: [{ text: prompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              valid: { type: Type.BOOLEAN },
              warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
              alternative_suggestion: { type: Type.STRING }
            },
            required: ["valid", "warnings"]
          }
        }
      });

      const text = response.text;
      return JSON.parse(text || '{}') as SpatialValidation;
    };

    try {
      return await runValidation(GEMINI_CONFIG.MODELS.REASONING);
    } catch (error) {
      console.warn("Validation Pro failed, falling back to Flash...", error);
      return await runValidation(GEMINI_CONFIG.MODELS.REASONING_FALLBACK);
    }
  });
};
