import { GoogleGenAI, Type } from "@google/genai";
import { DetailedRoomAnalysis, IdentifiedObject, IntentTranslation, SpatialValidation } from "../types";

// Helper to get API Key safely
const getApiKey = () => process.env.API_KEY || '';

// Analyze the room space for layout and architectural constraints
export const analyzeRoomSpace = async (base64Image: string): Promise<DetailedRoomAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = 'gemini-3-pro-preview';

  const systemInstruction = "Analyze this room's layout for architectural constraints. Identify doors, windows, walkways, and traffic flow. Estimate dimensions.";

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        { text: "Analyze the uploaded room according to your system instructions." },
      ],
    },
    config: {
      systemInstruction,
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
  if (!text) throw new Error("Empty response from agent");
  return JSON.parse(text) as DetailedRoomAnalysis;
};

// Identify a specific object at given coordinates
export const identifyObject = async (base64Image: string, x: number, y: number): Promise<IdentifiedObject> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = 'gemini-3-flash-preview';

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        { text: `What single object is at coordinate [x=${x.toFixed(0)}, y=${y.toFixed(0)}] (scaled 0-1000)? Return JSON: { "id": "string", "name": "string", "position": "string" }.` },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          position: { type: Type.STRING },
        },
        required: ["id", "name", "position"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Object identification failed");
  return JSON.parse(text) as IdentifiedObject;
};

// Translate user intent into a technical execution plan
export const translateIntentWithSpatialAwareness = async (
  base64Image: string,
  userText: string,
  identifiedObject: IdentifiedObject,
  spatialContext: DetailedRoomAnalysis
): Promise<IntentTranslation> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = 'gemini-3-pro-preview';

  const prompt = `CURRENT SCENE CONTEXT:
Room Type: ${spatialContext.room_type}
Target Object: ${identifiedObject.name} at ${identifiedObject.position}.
User Request: "${userText}"

TASK:
Translate this request into a configuration for a generative visualization.

CRITICAL INSTRUCTION FOR IMAGEN PROMPT:
Since we are generating a FULL SCENE visualization, your 'imagen_prompt' must describe the ENTIRE ROOM, not just the object.
Start with the room style, lighting, and background (e.g., "A modern living room with hardwood floors...").
Then describe the specific change:
If REMOVE: Describe the empty space where the object was (e.g., "an open area with visible flooring").
If EDIT: Describe the object with its NEW properties.
If MOVE: Describe the object in the new location.
Ensure photorealism.`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        { text: prompt },
      ],
    },
    config: {
      systemInstruction: "You are a spatial designer. Classify the user's intent (REMOVE, MOVE, EDIT). Return JSON. Ensure 'imagen_prompt' is a full-scene description suitable for generating a complete image.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          operation_type: { type: Type.STRING, enum: ["REMOVE", "MOVE", "EDIT"] },
          interpreted_intent: { type: Type.STRING },
          proposed_action: { type: Type.STRING },
          spatial_check_required: { type: Type.BOOLEAN },
          new_position: {
            type: Type.OBJECT,
            properties: { description: { type: Type.STRING } },
            nullable: true
          },
          removed_object_replacement: { type: Type.STRING, nullable: true },
          imagen_prompt: { type: Type.STRING },
        },
        required: ["operation_type", "interpreted_intent", "proposed_action", "spatial_check_required", "imagen_prompt"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Intent translation failed");
  return JSON.parse(text) as IntentTranslation;
};

// Validate if the proposed action violates constraints
export const validateSpatialChange = async (
  translation: IntentTranslation,
  spatialContext: DetailedRoomAnalysis
): Promise<SpatialValidation> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = 'gemini-3-pro-preview';

  const prompt = `Review this action: ${translation.operation_type} - ${translation.proposed_action}.
Room Constraints: ${JSON.stringify(spatialContext.constraints)}.
Traffic Flow: ${spatialContext.traffic_flow}.
Is this safe? Be strict on blocking paths.`;

  const response = await ai.models.generateContent({
    model,
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

// Generate image using 'gemini-2.5-flash-image' for reliability (fixes 404 on Imagen)
export const generateImageWithImagen3 = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = 'gemini-2.5-flash-image';

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{ text: prompt }],
      },
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
    
    throw new Error("No image generated in response");
  } catch (error) {
     console.error("Image generation failed", error);
     throw error;
  }
};

// Get streaming response for chat
export const getGeminiResponse = async (
  base64Image: string, 
  userPrompt: string, 
  pin: { x: number, y: number } | null, 
  onChunk: (text: string) => void
) => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = 'gemini-3-flash-preview';
  
  const stream = await ai.models.generateContentStream({
    model,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        { text: userPrompt }
      ]
    }
  });

  let fullText = "";
  for await (const chunk of stream) {
    const text = chunk.text || "";
    fullText += text;
    onChunk(fullText);
  }
  return fullText;
};
