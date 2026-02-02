/**
 * 3D Room Improvement Suggestions
 */

export interface RoomImprovementPromptParams {
  userGoal: string;
  isPlan: boolean;
  roomType: string;
  objectsStr: string;
  learningSection: string;
}

export const build3DRoomImprovementPrompt = (params: RoomImprovementPromptParams): string => {
  const { userGoal, isPlan, roomType, objectsStr, learningSection } = params;

  if (isPlan) {
    return `ROLE: Expert Architectural & Space Planning Consultant with deep understanding of structural constraints.
CONTEXT: User has uploaded a 2D FLOOR PLAN.
TASK: Analyze the floor plan geometry, alignment, walls, rooms, and space to provide intelligent suggestions.
GOAL: "${userGoal}"

CRITICAL ANALYSIS REQUIREMENTS:
1. FLOOR PLAN GEOMETRY ANALYSIS:
   - Analyze room proportions, alignment, and spatial relationships
   - Identify open spaces vs. compartmentalized areas
   - Detect symmetry, formality, and flow patterns
   - Assess natural light sources (windows, openings)
   - Evaluate traffic flow and functional zones

2. STRUCTURAL CONSTRAINTS (CRITICAL - NEVER VIOLATE):
   - KITCHEN: Plumbing fixtures (sink, dishwasher) CANNOT be moved. Walls with plumbing are structural.
   - BATHROOM: All plumbing (toilet, sink, shower) CANNOT be relocated. These walls are load-bearing.
   - Identify load-bearing walls vs. non-load-bearing partitions
   - Respect HVAC, electrical, and structural requirements

3. INTELLIGENT SUGGESTIONS BASED ON ANALYSIS:
   - If open space detected: Suggest styles that enhance openness (Modern, Industrial, Minimalist)
   - If compartmentalized: Suggest cozy styles (Traditional, Cottage, French Country)
   - If large windows/glass: Suggest light-enhancing styles (Coastal, Biophilic, Japandi)
   - If symmetrical/formal: Suggest structured styles (Neoclassical, Mid-Century Modern)
   - Wall removal suggestions ONLY for non-load-bearing, non-plumbing walls
   - Suggest optimal room functions based on size and location

${learningSection}

SUGGESTION TYPES FOR PLANS:
1. Structural Mod (ONLY non-critical walls): "Remove non-load-bearing wall between X and Y"
2. Visualization Style (geometry-appropriate): "Visualize in [Style] style - this layout's [geometry feature] suits this style because..."
3. Layout Optimization: "Add [element] to improve [function] in this [room type]"
4. Room Function Optimization: "Convert [room] to [function] - this space is ideal because..."

OUTPUT JSON SCHEMA:
[
  {
    "title": "Short Title",
    "description": "Why this change works for this layout.",
    "action_type": "EDIT" | "MOVE" | "REMOVE" | "STYLE",
    "target_object_name": "Structure", 
    "suggested_prompt": "Precise prompt to generate the visualization or edit",
    "icon_hint": "layout" | "style" | "remove",
    "confidence": 0.0-1.0
  }
]
Return 3-5 suggestions.`;
  } else {
    return `ROLE: Expert Interior Design Consultant with deep aesthetic analysis capabilities.
CONTEXT: 3D ROOM PHOTO.
TASK: Analyze the room's current style, color palette, materials, lighting, and spatial relationships. Provide intelligent, personalized design suggestions.
GOAL: "${userGoal}"

DEEP STYLE ANALYSIS REQUIRED:
1. CURRENT STYLE ASSESSMENT:
   - Identify existing style (Modern, Traditional, Eclectic, etc.)
   - Analyze color palette and harmony
   - Assess material choices and textures
   - Evaluate lighting quality and atmosphere
   - Note spatial relationships and flow

2. ROOM CONTEXT:
   - Room Type: ${roomType}
   - Key Objects: ${objectsStr}
   - Current constraints and opportunities

3. PERSONALIZED SUGGESTIONS:
   - Base suggestions on actual room analysis, not generic templates
   - Consider how suggestions complement existing style
   - Suggest improvements that enhance the room's character
   - Focus on high-impact changes (REMOVE clutter, MOVE furniture for better flow, STYLE updates)
   - Mix of different action types (not all EDIT)

${learningSection}

DIVERSITY RULES (Generate 3-5 items):
1. Material Swap (e.g. Velvet to Leather)
2. Layout/removal (e.g. Declutter X)
3. Lighting/Atmosphere
4. Color Palette Shift
5. Bold Statement Piece
6. Architectural/Structural Tweak

CONSTRAINTS:
- Do NOT suggest impossible moves.
- Focus on visual impact.
- When generating suggested_prompt, ALWAYS use successful patterns and AVOID failed patterns for that operation type
- Generate DIFFERENT patterns if previous ones failed

OUTPUT JSON SCHEMA:
[
  {
    "title": "Short Title",
    "description": "One sentence explaining why.",
    "action_type": "EDIT" | "MOVE" | "REMOVE" | "STYLE",
    "target_object_name": "Exact name from detected objects if possible, or new object",
    "suggested_prompt": "Precise instruction for image generation",
    "icon_hint": "style" | "layout" | "remove" | "color",
    "confidence": 0.0-1.0
  }
]
Return 3-5 suggestions.`;
  }
};

export const buildObjectSpecificPrompt = (detectedObjects: Array<{ name: string }>, learningSection: string): string => {
  return `Generate 2-3 quick improvement suggestions for objects in this room.

Detected objects: ${detectedObjects.map(o => o.name).join(', ')}

${learningSection}

Return JSON array of suggestions in same format as above.`;
};

