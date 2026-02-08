
import { GoogleGenAI } from "@google/genai";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry, generateCacheKey, runWithFallback } from "../../utils/apiUtils";
import { getPresetForOperation } from "../../config/modelConfigs";

/**
 * Analyzes a reference image to extract material, texture, and pattern information.
 * Uses the Material & Texture Analyst persona.
 */
export const analyzeReferenceImage = async (base64Image: string): Promise<string> => {
  // Fix: Use length and tail to ensure uniqueness. First 50 chars are often identical headers.
  const uniqueId = `${base64Image.length}_${base64Image.slice(-30)}`;
  const cacheKey = generateCacheKey('refAnalysis_v42_object_id', uniqueId);

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const runRefAnalysis = async (model: string) => {
      const prompt = `
      You are a Material & Texture Analyst. Your job is to extract style information from reference images to be applied to 3D objects.

      YOUR ANALYSIS STEPS:
      1. OBJECT IDENTITY: What is the primary object shown? (e.g., "Stainless Steel Refrigerator", "Velvet Sofa").
      2. TEXT DETECTION: Look for any written text (brand names, color codes).
      3. TEXTURE ANALYSIS: Describe the physical surface. Is it matte, glossy, rough, grain-filled, woven?
      4. COLOR EXTRACTION: Name the dominant color and the accent colors.

      OUTPUT FORMAT (String):
      "Object: [Object Name]. Material: [Material Name]. Texture: [Detailed Texture]. Color: [Color]. Style: [Modern/Rustic/Etc]."

      Example Output:
      "Object: French Door Refrigerator. Material: Brushed Stainless Steel. Texture: Smooth, vertical grain. Color: Silver/Grey. Style: Modern."
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
           responseMimeType: "text/plain",
           temperature: getPresetForOperation('REFERENCE_ANALYSIS').temperature,
        }
      });

      const text = response.text?.trim();
      if (!text) throw new Error("Reference analysis failed");
      return text;
    };

    return runWithFallback(
      () => runRefAnalysis(GEMINI_CONFIG.MODELS.REASONING),
      async () => {
        try {
          return await runRefAnalysis(GEMINI_CONFIG.MODELS.REASONING_FALLBACK);
        } catch (fallbackError) {
          return "Object: Unknown. Material: Custom. Texture: Inferred from image. Color: As seen.";
        }
      },
      "Reference Analysis"
    );
  }, cacheKey);
};
