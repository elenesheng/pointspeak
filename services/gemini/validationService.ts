
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SpatialValidation, IntentTranslation } from "../../types/ai.types";
import { DetailedRoomAnalysis } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry, runWithFallback } from "../../utils/apiUtils";

export interface TopologyValidation {
  topology_changed: boolean;
  new_openings: boolean;
  wall_changes: boolean;
  reason?: string;
}

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

    return runWithFallback(
      () => runValidation(GEMINI_CONFIG.MODELS.REASONING),
      () => runValidation(GEMINI_CONFIG.MODELS.REASONING_FALLBACK),
      "Validation"
    );
  });
};

/**
 * Validate if rendered output has topology changes (new windows/doors, wall changes)
 * Used for automatic retry with stricter settings
 */
export const validateRenderingTopology = async (
  renderedImageBase64: string,
  planBase64: string,
  maskBase64: string
): Promise<TopologyValidation> => {
  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const runValidation = async (model: string) => {
      const schema: Schema = {
        type: Type.OBJECT,
        properties: {
          topology_changed: { type: Type.BOOLEAN, description: "Did wall topology change (new corners, shifted walls)?" },
          new_openings: { type: Type.BOOLEAN, description: "Did any new windows/doors appear that are not in the plan/mask?" },
          wall_changes: { type: Type.BOOLEAN, description: "Did walls move, get added, or get removed?" },
          reason: { type: Type.STRING, description: "Brief explanation if any changes detected" }
        },
        required: ["topology_changed", "new_openings", "wall_changes"]
      };

      const prompt = `Compare the rendered 3D image with the original floor plan and structural mask.

CRITICAL QUESTIONS (only flag SIGNIFICANT changes):
1. Did any NEW windows/doors appear in the rendered image that are NOT shown in the floor plan? (Ignore minor position shifts)
2. Did walls get ADDED or REMOVED? (Ignore wall thickness variance, corner rounding, or minor position adjustments)
3. Did wall topology change significantly (new corners, major wall shifts)? (Ignore minor pixel drift)

IMPORTANT: Only flag changes that are clearly significant:
- New openings (windows/doors) that don't exist in plan = TRUE
- Walls added or removed = TRUE
- Major topology changes (new corners, walls shifted significantly) = TRUE
- Minor adjustments, pixel drift, wall thickness variance, corner smoothing = FALSE

The floor plan and mask define the valid openings and wall positions. Only flag clear violations, not minor visual adjustments.

Respond with JSON indicating if significant topology changed, new openings appeared, or walls were added/removed.`;

      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: renderedImageBase64 } },
            { inlineData: { mimeType: 'image/jpeg', data: planBase64 } },
            { inlineData: { mimeType: 'image/png', data: maskBase64 } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      const text = response.text;
      return JSON.parse(text || '{"topology_changed": false, "new_openings": false, "wall_changes": false}') as TopologyValidation;
    };

    return runWithFallback(
      () => runValidation(GEMINI_CONFIG.MODELS.REASONING),
      () => runValidation(GEMINI_CONFIG.MODELS.REASONING_FALLBACK),
      "Topology Validation"
    );
  });
};
