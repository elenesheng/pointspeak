
import { GoogleGenAI } from "@google/genai";
import { IdentifiedObject } from "../../types/spatial.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey, withSmartRetry, generateCacheKey } from "../../utils/apiUtils";

const cleanJson = (text: string): string => {
  let clean = text.trim();
  clean = clean.replace(/^```(json)?/i, '').replace(/```$/, '');
  return clean.trim();
};

/**
 * Scans the entire image once to detect all objects with bounding boxes.
 * Used for client-side hit testing to avoid API calls on every click.
 */
export const scanImageForObjects = async (base64Image: string, skipCache: boolean = false): Promise<IdentifiedObject[]> => {
  // Fix: Use length and tail to ensure uniqueness.
  const uniqueId = `${base64Image.length}_${base64Image.slice(-30)}`;
  // Skip cache for post-edit scans to ensure fresh detection
  const cacheKey = skipCache ? null : generateCacheKey('fullScan_v6_rooms_objects', uniqueId);

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const model = "gemini-2.5-flash"; 

    const prompt = `
    Analyze this image and detect ALL distinct objects, surfaces, AND ROOMS.
    
    CRITICAL INSTRUCTIONS:
    1. IF FLOOR PLAN DETECTED:
       - You MUST identify each specific ROOM as a distinct object (e.g., "Master Bedroom", "Living Area", "Kitchen", "Bathroom").
       - Draw the bounding box around the ENTIRE room area (walls to walls).
       - Category for rooms should be "Structure".

    2. GRANULAR OBJECTS: Identify discrete items (e.g. "Lamp", "Vase", "Chair", "Faucet") with tight bounding boxes.
    
    3. SURFACES & BACKGROUNDS (PRIORITY): 
       - You MUST detect "Kitchen Backsplash", "Floor" (Tile/Wood), "Countertop", "Cabinetry", and "Walls".
       - For these surfaces, draw the bounding box to cover the ENTIRE VISIBLE EXTENT of that surface, even if parts are blocked by furniture.
       - DO NOT ignore corners or edges of floors/walls.
    
    Return a JSON list. 
    For each object, provide:
    1. "name": specific label (e.g. "Living Room", "Subway Tile Backsplash", "Oak Floor").
    2. "box_2d": [ymin, xmin, ymax, xmax] (normalized 0-1000 coordinates).
    3. "category": One of ["Furniture", "Appliance", "Structure", "Decor", "Surface"].
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: prompt },
        ],
      },
      config: { responseMimeType: "application/json" },
    });

    const text = response.text;
    if (!text) return [];

    try {
      const parsed = JSON.parse(cleanJson(text));
      // Ensure it's an array
      const list = Array.isArray(parsed) ? parsed : (parsed.objects || []);
      
      return list.map((item: any, index: number) => ({
        id: `scan_${index}_${Date.now()}`,
        name: item.name || "Unknown Object",
        position: item.box_2d ? `[${Math.round((item.box_2d[1] + item.box_2d[3])/2)}, ${Math.round((item.box_2d[0] + item.box_2d[2])/2)}]` : "Detected",
        box_2d: item.box_2d,
        category: item.category || 'Furniture',
        visual_details: item.name, 
        confidence: 0.9
      }));
    } catch (e) {
      console.warn("Failed to parse scan result", e);
      return [];
    }
  }, cacheKey || undefined);
};

// Kept for backward compatibility or specific fallbacks if needed.
export const identifyObject = async (
  base64Image: string, 
  x: number, 
  y: number,
  is2dPlan: boolean = false 
): Promise<IdentifiedObject> => {
   return {
     id: `legacy_${Date.now()}`,
     name: "Selected Object",
     position: `[${x},${y}]`,
     visual_details: "Object at clicked location",
     category: "Furniture"
   };
};
