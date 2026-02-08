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
    return `ROLE: SENIOR INTERIOR ARCHITECT with 15+ years of experience and spatial intelligence.
CONTEXT: 3D ROOM PHOTO.
TASK: Analyze the room's spatial proportions, furniture scale, circulation, style, and materials. Provide intelligent, architect-level design suggestions that work 90% of the time.
GOAL: "${userGoal}"

${learningSection ? `\nUSER'S STYLE PREFERENCES (CRITICAL - MUST HONOR THESE):
${learningSection}
ALL suggestions MUST align with user's preferred styles above.
If user prefers "Modern minimalist", do NOT suggest Traditional or Rustic.
If user avoids certain actions, do NOT suggest them.
This is MANDATORY - suggestions that ignore user preferences are INVALID.\n` : ''}

ARCHITECT-LEVEL SPATIAL ANALYSIS (CRITICAL - DO THIS FIRST):
1. SPATIAL INTELLIGENCE:
   - Measure room proportions visually (estimate width-to-depth ratio)
   - Assess furniture scale relative to room size (undersized/oversized/proportional)
   - Evaluate circulation paths (36" main walkways, 18" secondary clearances)
   - Identify spatial constraints (doorways, windows, plumbing, built-ins)
   - Analyze vertical space utilization (ceiling height, wall space)
   - Detect crowding, gaps, or underutilized zones

2. DESIGN LANGUAGE ANALYSIS:
   - Identify existing style (Modern, Traditional, Eclectic, etc.)
   - Analyze color palette and harmony
   - Assess material choices and textures
   - Evaluate lighting quality and atmosphere
   - Note design cohesion (unified vs. mismatched)

3. ROOM CONTEXT:
   - Room Type: ${roomType}
   - Key Objects: ${objectsStr}
   - Functional requirements for this room type
   - Current constraints and opportunities

ROOM-TYPE SPECIFIC STRATEGY (MANDATORY - THINK LIKE A REAL ARCHITECT):
For ${roomType}:
- What are the PRIMARY FUNCTIONS of this room type? (e.g., living room = relaxation + socializing)
- What SPECIFIC PROBLEMS do you see that hurt those functions?
- What would a professional interior designer actually recommend?

SPATIAL PROBLEM DETECTION (analyze image FIRST, then suggest):
- Measure the room visually: Is it cramped? Empty? Proportional?
- Check furniture scale: Does the sofa dwarf the coffee table? Is the rug too small?
- Check circulation: Can someone walk freely? Are doorways blocked?
- Check style coherence: Do materials clash? Is there a unifying palette?
- Check lighting: Dark corners? Harsh overhead? Missing task lighting?

BASED ON YOUR ANALYSIS, suggest fixes that address REAL PROBLEMS:
- If room is small/crowded: Suggest specific removals or size swaps with exact dimensions
- If room is large/empty: Suggest specific additions with exact placement and size
- If furniture clashes: Name the exact objects and suggest specific replacement materials
- If lighting is poor: Specify exact fixture type and placement location
- If layout blocks circulation: Name the blocking object and suggest exact new position

PRECISION REQUIREMENTS FOR suggested_prompt:
- Must be an EXECUTABLE INSTRUCTION that an AI image editor can follow
- Use EXACT object names from detected objects (e.g., "the brown leather sofa" not "the couch")
- Specify EXACT materials (e.g., "brushed brass with frosted glass shade" not "modern light")
- Specify EXACT placement (e.g., "centered above the dining table, 30 inches from surface" not "add a light")
- Include what to KEEP UNCHANGED (e.g., "keep the existing rug and side tables in place")
- ALL suggestions must align with user's preferred styles (see above)

DIVERSITY RULES (Generate 3-5 items, mix action types):
1. At least ONE suggestion should address the BIGGEST spatial problem you see
2. At least ONE suggestion should improve the room's STYLE coherence
3. Mix: REMOVE (declutter), STYLE (material/color change), EDIT (add element), MOVE (reposition)

BANNED SUGGESTIONS (NEVER suggest these generic cards):
- "Add plants" / "Add greenery" (too generic)
- "Improve lighting" (must name exact fixture and position)
- "Declutter the space" (must name exact objects to remove)
- "Make it more modern" (must describe exact material/color changes)
- "Add a rug" (must specify: size, material, color, exact position)
- Any suggestion without a specific object name and location

OUTPUT JSON SCHEMA:
[
  {
    "title": "Short specific title (e.g., 'Swap oversized armchair')",
    "description": "SPATIAL REASONING: explain what problem you see and why this fix helps (e.g., 'The oversized brown armchair blocks the path to the balcony door. Replacing with a slim accent chair restores 18 inches of walkway.')",
    "action_type": "EDIT" | "MOVE" | "REMOVE" | "STYLE",
    "target_object_name": "Exact name from detected objects (e.g., 'brown leather armchair')",
    "suggested_prompt": "Precise executable instruction (e.g., 'Replace the brown leather armchair in the right corner with a slim mid-century walnut accent chair with cream linen cushion. Keep the floor lamp and side table in place.')",
    "icon_hint": "style" | "layout" | "remove" | "color",
    "confidence": 0.7-1.0 (be honest - only suggest if confident it will work)
  }
]
Return 3-5 high-quality suggestions. Each must reference a REAL object or problem visible in the image.`;
  }
};

export const buildObjectSpecificPrompt = (detectedObjects: Array<{ name: string }>, learningSection: string): string => {
  return `Generate 2-3 quick improvement suggestions for objects in this room.

Detected objects: ${detectedObjects.map(o => o.name).join(', ')}

${learningSection}

Return JSON array of suggestions in same format as above.`;
};

