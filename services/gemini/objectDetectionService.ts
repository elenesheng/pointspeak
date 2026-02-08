import { GoogleGenAI } from '@google/genai';
import { IdentifiedObject } from '../../types/spatial.types';
import { getApiKey, withSmartRetry, generateCacheKey } from '../../utils/apiUtils';
import { getPresetForOperation } from '../../config/modelConfigs';

interface DetectedObjectRaw {
  name?: string;
  box_2d?: [number, number, number, number];
  category?: string;
  confidence?: number;
}

interface ParsedDetectionResult {
  objects?: DetectedObjectRaw[];
  items?: DetectedObjectRaw[];
}

const cleanJson = (text: string): string => {
  let clean = text.trim();
  
  // Remove markdown code blocks
  clean = clean.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '');
  
  // Remove any leading/trailing non-JSON characters
  const firstBracket = clean.indexOf('[');
  const firstBrace = clean.indexOf('{');
  const start = Math.min(
    firstBracket >= 0 ? firstBracket : Infinity,
    firstBrace >= 0 ? firstBrace : Infinity
  );
  if (start !== Infinity) {
    clean = clean.slice(start);
  }
  
  // Find the last closing bracket/brace
  const lastBracket = clean.lastIndexOf(']');
  const lastBrace = clean.lastIndexOf('}');
  const end = Math.max(lastBracket, lastBrace);
  if (end > 0) {
    clean = clean.slice(0, end + 1);
  }
  
  // Fix common JSON issues
  // Remove trailing commas before ] or }
  clean = clean.replace(/,\s*([}\]])/g, '$1');
  
  // Fix unquoted property names (simple cases)
  clean = clean.replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  
  return clean.trim();
};

export const scanImageForObjects = async (
  base64Image: string,
  skipCache: boolean = false
): Promise<IdentifiedObject[]> => {
  const uniqueId = `${base64Image.length}_${base64Image.slice(-30)}`;
  const cacheKey = skipCache ? null : generateCacheKey('fullScan_v7_improved', uniqueId);

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const model = 'gemini-3-flash-preview';

    const prompt = `Detect all objects and spaces in this image. Return a JSON array.

Categories to detect:

1. ROOMS (for floor plans):
   - Identify each labeled room as a separate object (Living Room, Kitchen, Bedroom, etc.)
   - Bounding box should encompass the entire room area from wall to wall
   - Category: "Structure"

2. SURFACES (walls, floors, countertops):
   - Detect large continuous surfaces: floors, walls, backsplashes, countertops, cabinetry
   - Bounding box should cover the full visible extent, even if partially obscured by furniture
   - Category: "Surface"
   - Examples: "Oak Hardwood Floor", "Subway Tile Backsplash", "Granite Countertop"

3. FURNITURE (chairs, tables, sofas):
   - Individual furniture pieces with tight bounding boxes
   - Category: "Furniture"

4. APPLIANCES (refrigerators, ovens, dishwashers):
   - Built-in and freestanding appliances
   - Category: "Appliance"

5. DECOR (lamps, vases, artwork):
   - Decorative items and accessories
   - Category: "Decor"

Output format:
[
  {
    "name": "Master Bedroom",
    "box_2d": [100, 150, 600, 800],
    "category": "Structure"
  },
  {
    "name": "Marble Countertop",
    "box_2d": [200, 300, 250, 900],
    "category": "Surface"
  }
]

Note: box_2d format is [ymin, xmin, ymax, xmax] with coordinates normalized 0-1000.`;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        temperature: getPresetForOperation('OBJECT_DETECTION').temperature,
      },
    });

    const text = response.text;
    if (!text) return [];

    try {
      const cleanedText = cleanJson(text);
      let parsed: DetectedObjectRaw[] | ParsedDetectionResult;
      
      try {
        parsed = JSON.parse(cleanedText);
      } catch (parseError) {
        const objectMatches = cleanedText.match(/\{[^{}]*"name"[^{}]*\}/g);
        if (objectMatches && objectMatches.length > 0) {
          const recoveredObjects: DetectedObjectRaw[] = [];
          for (const match of objectMatches) {
            try {
              const obj = JSON.parse(match);
              if (obj.name) {
                recoveredObjects.push(obj);
              }
            } catch {
              // Skip malformed individual objects
            }
          }
          if (recoveredObjects.length > 0) {
            parsed = recoveredObjects;
          } else {
            throw parseError;
          }
        } else {
          throw parseError;
        }
      }
      
      const list: DetectedObjectRaw[] = Array.isArray(parsed)
        ? parsed
        : (parsed as ParsedDetectionResult).objects || (parsed as ParsedDetectionResult).items || [];

      return list.map((item, index) => {
        const centerX = item.box_2d ? Math.round((item.box_2d[1] + item.box_2d[3]) / 2) : 500;
        const centerY = item.box_2d ? Math.round((item.box_2d[0] + item.box_2d[2]) / 2) : 500;

        return {
          id: `scan_${index}_${Date.now()}`,
          name: item.name || 'Unknown Object',
          position: `[${centerX}, ${centerY}]`,
          box_2d: item.box_2d || [0, 0, 1000, 1000],
          category: (item.category as IdentifiedObject['category']) || 'Furniture',
          visual_details: item.name,
          confidence: item.confidence || 0.9,
        };
      });
    } catch (e) {
      return [];
    }
  }, cacheKey || undefined);
};

export const identifyObject = async (
  _base64Image: string,
  x: number,
  y: number,
  _is2dPlan: boolean = false
): Promise<IdentifiedObject> => {
  return {
    id: `legacy_${Date.now()}`,
    name: 'Selected Object',
    position: `[${x}, ${y}]`,
    visual_details: 'Object at clicked location',
    category: 'Furniture',
    confidence: 0.5,
  };
};