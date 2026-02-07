/**
 * Multi-stage rendering prompts
 */

export interface MultiStagePromptParams {
  styleDescription: string;
  objectContext: string;
  referenceBase64: string | null;
  detectedObjects?: Array<{ name: string; category?: string }>;
  isAlreadyVisualized?: boolean;
}

export const buildStyleProjection = (styleDescription: string, referenceBase64: string | null): string => {
  const refRule = referenceBase64
    ? `- Reference image: Use ONLY for materials, colors, lighting mood
- Do NOT copy layout, camera, or architectural elements from reference`
    : '';
  
  return `STYLE APPLICATION:
${refRule}
- Style Description: ${styleDescription}`;
};

export const getStage1StructurePrompt = (): string => {
  return `STAGE 1 — STRUCTURAL PROJECTION (NON-CREATIVE)

You are NOT designing or generating a new room.
You are PROJECTING an EXISTING room into a white clay model.

SPATIAL AUTHORITY (ABSOLUTE):
- The Structural Mask defines EXACT wall positions
- The Floor Plan defines EXACT openings (doors/windows)
- Do NOT normalize, correct, improve, or redesign proportions
- Do NOT invent walls, doors, windows, or room extensions
- If geometry is awkward or asymmetrical, PRESERVE IT
- Every corner in the 2D map must map to a corner in the 3D view
- No smoothing, no straightening, no symmetry fixes

CAMERA (LOCKED):
- Single fixed camera
- Eye level: 1.6m
- Standing INSIDE the room
- Looking straight forward
- 2-point perspective
- Horizon line exactly at 50% height
- Zero vertical tilt (all verticals parallel to image edges)
- Do NOT change camera after placement
- Do NOT output a top-down, aerial, or bird's-eye view

3D TRANSLATION (PROJECTION ONLY):
- Convert the Structural Mask into 3D walls AS-IS
- Translate white pixels from mask into 3D walls exactly as positioned
- The 2D Plan is a spatial map; this output MUST be a 3D PERSPECTIVE VIEW
- Do NOT reinterpret or redesign the layout

OPENINGS (STRICT):
- Only create doors/windows where the Floor Plan CLEARLY indicates them
- Cross-reference Structural Mask with Floor Plan to identify openings
- Render openings as voids (transparent)
- If uncertain → KEEP SOLID WALL (do not invent openings)

STYLE (ARCHITECTURAL WHITE MODEL):
- Matte white walls
- Black or dark neutral floor
- Neutral ambient lighting
- No textures, no furniture, no decor
- Emphasize volume and occlusion only
- Windows/Doors: Show as dark voids or openings (not solid white)

FORBIDDEN:
- New rooms
- Changed room size
- Added or removed doors/windows
- Perspective correction
- Top-down or isometric views
- Any decorative or stylistic decisions
- Normalization or "fixing" awkward geometry

FAILURE-AVOIDANCE HEURISTIC:
If any ambiguity exists in structure:
- Preserve existing walls
- Omit elements
- Never invent

This stage establishes IMMUTABLE spatial geometry.
Later stages may ONLY decorate this geometry.`;
};

export const buildStage2StylePrompt = (params: MultiStagePromptParams): string => {
  const { styleDescription, objectContext, referenceBase64, detectedObjects, isAlreadyVisualized = false } = params;
  
  const styleProjection = buildStyleProjection(styleDescription, referenceBase64);
  
  return `Add realistic materials, furniture, and styling to this 3D interior view.

GEOMETRY IMMUTABILITY (CRITICAL):
- Treat the incoming image as a fixed photograph
- Do NOT modify walls, openings, proportions, or camera
- All edits are surface-level only (materials, objects, lighting)
- Preserve the exact camera position, height, tilt, yaw, and roll
- Preserve the exact focal length and perspective
- Preserve all vanishing points exactly
- Do NOT reframe, recrop, zoom, rotate, or re-angle the scene

GEOMETRY (PRESERVE):
- Maintain perspective geometry faithfully (camera angle, viewpoint, spatial structure)
- Keep vertical lines parallel to edges, horizon at center
- Preserve wall positions, room boundaries, and spatial relationships
- Maintain window/balcony door openings as transparent glass

${styleProjection}
${objectContext}

${isAlreadyVisualized ? `
${detectedObjects && detectedObjects.length > 0 ? `
OBJECTS (STRICT):
Only these objects may appear:
${detectedObjects.map(o => `- ${o.name}${o.category ? ` (${o.category})` : ''}`).join('\n')}
- Do NOT introduce furniture/decor from other rooms
- Do NOT invent secondary spaces
- Do NOT invent windows/doors
- If uncertain, OMIT
` : ''}
` : `
FURNITURE POLICY (PLAN-BASED):
- Include basic structural furniture that anchors scale and perspective:
  * One main seating element (sofa, bed, or dining chairs)
  * One table or surface (coffee table, dining table, or island)
- Furniture must sit flush with the floor and align with walls
- Furniture anchors scale and helps establish proper 3D perspective
- Maintain proper 3D perspective: furniture should appear grounded with correct depth
- Keep clear circulation; never block doors/windows
- Do NOT invent additional rooms or adjacent spaces
- If uncertain about placement, omit rather than guess

${detectedObjects && detectedObjects.length > 0 ? `
Note: Detected objects: ${detectedObjects.map(o => o.name).join(', ')}
` : ''}
`}

PRIORITY:
1. Visual plausibility and photographic coherence
2. Wall layout should be visually consistent with the plan (not pixel-perfect)
3. Reference image is style-only (if present)
4. If uncertain, omit rather than guess

LIGHTING:
- Primary: Through window/balcony portals
- Secondary: Professional interior photography lighting
- Maintain image quality and sharpness`;
};

