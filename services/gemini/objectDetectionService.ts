
import { GoogleGenAI, Type } from "@google/genai";
import { IdentifiedObject } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry, generateCacheKey } from "../../utils/apiUtils";

/**
 * Identify a specific object or sub-component at given coordinates.
 * Uses the Precision Object Detector persona.
 */
export const identifyObject = async (base64Image: string, x: number, y: number): Promise<IdentifiedObject> => {
  const cacheKey = generateCacheKey('objDetect_v8', x.toFixed(0), y.toFixed(0));

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const runDetection = async (model: string) => {
      // Prompt designed for JSON extraction without strict schema if needed
      const prompt = `
      You are a Precision Object Detector.
      INPUT COORDINATE: [x=${x.toFixed(0)}, y=${y.toFixed(0)}] (on a 1000x1000 grid).

      YOUR TASK:
      1. Identify the SMALLEST specific element at that exact point (The "Child").
      2. Identify the LOGICAL PARENT object that the child belongs to.
      3. Describe the VISUALS of the PARENT object in high detail.

      OUTPUT JSON (Do not include markdown blocks):
      {
        "name": "Child Element Name",
        "parent_structure": "Parent Object Name",
        "visual_details": "Detailed visual description of the PARENT object...",
        "confidence": 0.95
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
          // We intentionally remove strict responseSchema here to prevent 400 errors 
          // with some model versions when handling coordinate-based vision tasks.
          // The prompt is strong enough to enforce JSON.
        },
      });

      const text = response.text;
      if (!text) throw new Error("Object identification failed");
      
      const parsed = JSON.parse(text);
      return {
        id: parsed.id || `obj_${Date.now()}`,
        position: parsed.position || `[${x.toFixed(0)},${y.toFixed(0)}]`,
        name: parsed.name || "Unknown Object",
        parent_structure: parsed.parent_structure || "Room Item",
        visual_details: parsed.visual_details || "Standard object",
        confidence: parsed.confidence || 0.5
      } as IdentifiedObject;
    };

    try {
      // Use Flash (REASONING_FALLBACK) primarily for Object Detection as it's faster and often better at point-identification than the heavy Thinking model
      return await runDetection(GEMINI_CONFIG.MODELS.REASONING_FALLBACK);
    } catch (error) {
       console.warn("Detection Flash failed, trying Reasoning model...", error);
       try {
         // Fallback to the Thinking model if Flash fails
         return await runDetection(GEMINI_CONFIG.MODELS.REASONING);
       } catch (fallbackError) {
         console.error("All detection models failed.", fallbackError);
         // Return a safe fallback object so the app doesn't crash
         return {
           id: `fallback-${Date.now()}`,
           name: "Selected Area",
           position: `[${x.toFixed(0)}, ${y.toFixed(0)}]`,
           parent_structure: "Room Item",
           visual_details: "Object at selected location",
           confidence: 0
         };
       }
    }
  }, cacheKey);
};
