
import { GoogleGenAI } from "@google/genai";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry, generateCacheKey } from "../../utils/apiUtils";

/**
 * Analyzes a reference image to extract material, texture, and pattern information.
 * Uses the Material & Texture Analyst persona.
 */
export const analyzeReferenceImage = async (base64Image: string): Promise<string> => {
  const cacheKey = generateCacheKey('refAnalysis_v4', base64Image.substring(0, 50));

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const runRefAnalysis = async (model: string) => {
      const prompt = `
      You are a Material & Texture Analyst. Your job is to extract style information from reference images to be applied to 3D objects.

      YOUR ANALYSIS STEPS:
      1. TEXT DETECTION: Look for any written text (brand names, color codes, material types like "Oak", "Marble"). Use this text to ground your analysis.
      2. TEXTURE ANALYSIS: Describe the physical surface. Is it matte, glossy, rough, grain-filled, woven?
      3. COLOR EXTRACTION: Name the dominant color and the accent colors.

      OUTPUT FORMAT (String):
      "Material: [Name found in text or inferred]. Texture: [Detailed Texture]. Color: [Color]. Style: [Modern/Rustic/Etc]."

      Example Output:
      "Material: White Carrara Marble. Texture: Polished, smooth with grey veining. Color: Cool white with charcoal veins. Style: Luxury Stone."
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
           temperature: 0.3,
        }
      });

      const text = response.text?.trim();
      if (!text) throw new Error("Reference analysis failed");
      
      console.log(`Reference Analysis (${model}):`, text);
      return text;
    };

    try {
      return await runRefAnalysis(GEMINI_CONFIG.MODELS.REASONING);
    } catch (error) {
       console.warn("Reference Analysis Pro failed, falling back to Flash...", error);
       try {
         return await runRefAnalysis(GEMINI_CONFIG.MODELS.REASONING_FALLBACK);
       } catch (fallbackError) {
         return "Material: Custom. Texture: Inferred from image. Color: As seen.";
       }
    }
  }, cacheKey);
};
