
import { GoogleGenAI, Type } from "@google/genai";
import { DetailedRoomAnalysis } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry, generateCacheKey } from "../../utils/apiUtils";

/**
 * Analyze the room space for layout and architectural constraints.
 * Implements Fallback: Pro -> Flash
 */
export const analyzeRoomSpace = async (base64Image: string): Promise<DetailedRoomAnalysis> => {
  const cacheKey = generateCacheKey('roomAnalysis', base64Image.substring(0, 50));

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const runAnalysis = async (model: string) => {
      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: "Analyze the uploaded room according to your system instructions." },
          ],
        },
        config: {
          systemInstruction: "Analyze this room's layout for architectural constraints. Identify doors, windows, walkways, and traffic flow. Estimate dimensions.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              room_type: { type: Type.STRING },
              constraints: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    location: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["type", "location", "description"],
                },
              },
              traffic_flow: { type: Type.STRING },
            },
            required: ["room_type", "constraints", "traffic_flow"],
          },
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from room analysis");
      return JSON.parse(text) as DetailedRoomAnalysis;
    };

    try {
      return await runAnalysis(GEMINI_CONFIG.MODELS.REASONING);
    } catch (error) {
      console.warn("Room Analysis Pro failed, falling back to Flash...", error);
      return await runAnalysis(GEMINI_CONFIG.MODELS.REASONING_FALLBACK);
    }
  }, cacheKey);
};
