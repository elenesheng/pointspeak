
import { GoogleGenAI, Type } from "@google/genai";
import { DetailedRoomAnalysis, IdentifiedObject, IntentTranslation, SpatialValidation, Coordinate } from "../types";

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
  spatialContext: DetailedRoomAnalysis,
  pins: Coordinate[]
): Promise<IntentTranslation> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = 'gemini-3-pro-preview';

  let spatialPromptAddendum = "";
  let systemInstructionAddendum = "";

  if (pins && pins.length === 2) {
    const p1 = pins[0];
    const p2 = pins[1];
    spatialPromptAddendum = `
    MOVEMENT VECTOR DEFINED:
    The user has set a precise spatial translation vector.
    Point A (Source): [${p1.x}, ${p1.y}] (Current location of ${identifiedObject.name})
    Point B (Target): [${p2.x}, ${p2.y}] (Destination)
    User Intent: Move the object found at Point A to Point B.
    `;
    systemInstructionAddendum = "The user has defined a specific movement vector. The object at Point A [x1, y1] should be moved to Point B [x2, y2]. Calculate the perspective and scaling changes required for the new location.";
  }

  const prompt = `CURRENT SCENE CONTEXT:
Room Type: ${spatialContext.room_type}
Target Object: ${identifiedObject.name} at ${identifiedObject.position}.
User Request: "${userText}"
${spatialPromptAddendum}

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
      systemInstruction: `You are a spatial designer. Classify the user's intent (REMOVE, MOVE, EDIT). Return JSON. Ensure 'imagen_prompt' is a full-scene description suitable for generating a complete image. ${systemInstructionAddendum}`,
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

// Perform Image Editing using Nano Banana Pro (gemini-3-pro-image-preview)
export const performImageEdit = async (
  originalImageBase64: string,
  translation: IntentTranslation,
  identifiedObject: IdentifiedObject
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const model = 'gemini-3-pro-image-preview';

  let editPrompt = "";

  switch (translation.operation_type) {
    case 'REMOVE':
      editPrompt = `Edit this image: Remove the ${identifiedObject.name} completely.
      Fill the empty space where it was with the appropriate floor/wall texture
      that matches the surrounding area. Make it look natural and seamless,
      as if the object was never there. Maintain all other elements unchanged.`;
      break;
    case 'MOVE':
      editPrompt = `Edit this image: Move the ${identifiedObject.name} to ${translation.new_position?.description || "a new location"}.
      Keep the same object (same style, color, material) but reposition it.
      Adjust lighting and shadows to match the new location.
      Fill the old location with matching floor/background.
      Maintain the same camera angle and perspective.`;
      break;
    case 'EDIT':
      editPrompt = `Edit this image: Transform ONLY the ${identifiedObject.name}.
      Changes: ${translation.proposed_action}
      Keep the exact same position, size, and orientation.
      Maintain all other objects and background unchanged.
      Match the lighting and style of the original image.`;
      break;
    default:
      editPrompt = `Edit this image: ${translation.proposed_action}`;
  }

  console.log("Starting Nano Banana Pro Edit:", translation.operation_type);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: originalImageBase64,
            },
          },
          { text: editPrompt },
        ],
      },
      config: {
        temperature: 0.4,
      },
    });

    console.log("Nano Banana Pro Response Received");

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("Image editing failed. No image returned.");
  } catch (error: any) {
    console.error("Nano Banana Pro Error:", error);
    // Explicitly handle 403 Permission Denied
    if (error.message?.includes('403') || error.message?.includes('PERMISSION_DENIED')) {
      throw new Error("PERMISSION_DENIED: The API key does not have access to 'gemini-3-pro-image-preview'. Please check billing.");
    }
    // Check for specific error requiring key re-selection
    if (error.message?.includes('Requested entity was not found')) {
      throw new Error("Requested entity was not found");
    }
    if (error.message?.includes('404')) throw new Error("Model not found (Check API access)");
    if (error.message?.includes('429')) throw new Error("Nano Banana Pro quota exceeded. Try again later.");
    throw error;
  }
};

// Get streaming response for chat
export const getGeminiResponse = async (
  base64Image: string, 
  userPrompt: string, 
  pins: Coordinate[], 
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
