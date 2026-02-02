
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { DetailedRoomAnalysis, RoomInsight } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry, generateCacheKey, runWithFallback } from "../../utils/apiUtils";
import { ROOM_ANALYSIS_SYSTEM_INSTRUCTION, getRoomAnalysisInstruction, buildUpdateInsightsPrompt } from "../../config/prompts/analysis/room";

/**
 * STRICT SCHEMA DEFINITIONS
 */
const insightItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING, description: "Category" },
    title: { type: Type.STRING, description: "Title" },
    description: { type: Type.STRING, description: "Details" },
    suggestions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "User-facing prompts to try" },
    system_instruction: { type: Type.STRING, description: "Technical Prompt Fix / Debug Code" }
  },
  required: ["category", "title", "description", "suggestions"]
};

const roomAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    room_type: { type: Type.STRING },
    is_2d_plan: { type: Type.BOOLEAN },
    traffic_flow: { type: Type.STRING },
    constraints: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          location: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["type", "location", "description"]
      }
    },
    insights: {
      type: Type.ARRAY,
      items: insightItemSchema
    }
  },
  required: ["room_type", "is_2d_plan", "constraints", "insights"]
};

const insightsWrapperSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    insights: { type: Type.ARRAY, items: insightItemSchema }
  },
  required: ["insights"]
};

export const analyzeRoomSpace = async (base64Image: string): Promise<DetailedRoomAnalysis> => {
  // Fix: Use length and tail to ensure uniqueness.
  const uniqueId = `${base64Image.length}_${base64Image.slice(-30)}`;
  const cacheKey = generateCacheKey('roomAnalysis_v17_align_strict', uniqueId);

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const runAnalysis = async (model: string) => {
      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: getRoomAnalysisInstruction() },
          ],
        },
        config: {
          systemInstruction: ROOM_ANALYSIS_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: roomAnalysisSchema, 
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from room analysis");
      
      const parsed = JSON.parse(text);
      return parsed as DetailedRoomAnalysis;
    };

    return runWithFallback(
      () => runAnalysis(GEMINI_CONFIG.MODELS.REASONING),
      () => runAnalysis(GEMINI_CONFIG.MODELS.REASONING_FALLBACK),
      "Room Analysis"
    );
  }, cacheKey);
};

export const updateInsightsAfterEdit = async (base64Image: string, previousAnalysis: DetailedRoomAnalysis, editDescription: string): Promise<RoomInsight[]> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const prompt = buildUpdateInsightsPrompt(editDescription);

  try {
      const response = await ai.models.generateContent({
      model: GEMINI_CONFIG.MODELS.REASONING, 
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: insightsWrapperSchema 
      }
    });
    
    const text = response.text;
    if (text) {
       const parsed = JSON.parse(text);
       return parsed.insights || [];
    }
    return previousAnalysis.insights || [];
  } catch (e) {
    return previousAnalysis.insights || [];
  }
};
