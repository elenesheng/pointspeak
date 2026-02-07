/**
 * Rendering prompts for 2D to 3D conversion
 */

export interface RenderingPromptParams {
  styleDescription: string;
  isAlreadyVisualized: boolean;
  referenceBase64: string | null;
  objectContext: string;
  detectedObjects?: Array<{ name: string; category?: string }>;
}

export const buildRenderingSystemPrompt = (params: RenderingPromptParams): string => {
  const { styleDescription, isAlreadyVisualized, referenceBase64, objectContext, detectedObjects } = params;

  const styleProjection = referenceBase64
    ? `STYLE APPLICATION:
- Reference image: Use ONLY for materials, colors, and lighting mood
- Do NOT copy layout, camera angle, or architectural elements from reference
- Style Description: ${styleDescription}`
    : `STYLE APPLICATION:
- Style Description: ${styleDescription}`;

  const geometryRules = isAlreadyVisualized
    ? `GEOMETRY (PRESERVE):
- Walls, doors, windows: Maintain same positions, sizes, and shapes
- Room boundaries: Keep dimensions and proportions consistent
- Furniture: Preserve positions and orientations
- Update only: Materials, colors, textures, lighting`
    : `GEOMETRY (VISUALLY CONSISTENT WITH PLAN):
- Structural mask (white=walls) guides wall layout - should broadly match the plan
- Wall layout should be visually consistent with the plan structure
- Floor plan indicates doors/windows - render where plan clearly shows them
- Maintain spatial relationships - no new rooms or major partitions
- Do not add new openings (windows/doors) unless shown clearly in the plan
- Minor visual adjustments for photographic coherence are acceptable`;

  return `ACT AS: A Professional Interior Photographer.

${isAlreadyVisualized ? `
TASK: Re-render existing 3D visualization. Update materials, lighting, finishes. Preserve geometry faithfully.
` : `
TASK: Generate a visually coherent 3D interpretation of this floor plan.
- Photographer standing INSIDE room at eye level (1.6m)
- Floor plan = spatial map; output = 3D perspective view
- Create a visually plausible 3D space that is consistent with the plan structure
- Wall layout should broadly match the plan - no new rooms or major partitions
`}

CAMERA & PERSPECTIVE:
- Eye level: 1.6m at room entrance, looking straight forward
- Horizon line: 50% from top
- 2-point perspective, vanishing points on horizon
- Zero-tilt: Vertical edges parallel to image edges
- Floor/ceiling/walls visible with proper perspective

${geometryRules}

${styleProjection}

${objectContext}

${isAlreadyVisualized ? `
${detectedObjects && detectedObjects.length > 0 ? `
OBJECTS (STRICT):
Only these objects may appear:
${detectedObjects.map(o => `- ${o.name}${o.category ? ` (${o.category})` : ''}`).join('\n')}
- Do NOT introduce furniture/decor from other rooms
- Do NOT invent secondary spaces
- If uncertain, OMIT
` : ''}
` : `
FURNITURE POLICY (PLAN-BASED):
- Include basic structural furniture that anchors scale and perspective:
  * One main seating element (sofa, bed, or dining chairs)
  * One table or surface (coffee table, dining table, or island)
- Furniture must sit flush with the floor and align with walls
- Furniture anchors scale and helps establish proper 3D perspective
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
- Primary: From window positions (if present)
- Secondary: Realistic interior lighting

Output: Professional interior photograph with correct perspective.`;
};

export const getRenderingInstruction = (isAlreadyVisualized: boolean, referenceBase64: string | null, strictMode: boolean = false): string => {
  if (isAlreadyVisualized) {
    return `Update materials and lighting. Keep geometry identical.
- Preserve windows/doors as glass portals
- Professional photography lighting`;
  }

  if (strictMode) {
    return `CORRECTION MODE: Fix only detected issues in the structure.

STRUCTURE:
- Previous image (first image) shows the current structure - use it as visual anchor
- Mask (white=walls) guides wall layout - should be visually consistent
- Correct only the detected issues (new walls, shifted openings, topology changes)
- Do NOT re-imagine the entire structure
- Preserve what is correct in the previous image

OPENINGS:
- Render where plan CLEARLY shows them
- If uncertain: keep wall solid (no opening)

CAMERA:
- Inside room at 1.6m, looking straight forward
- Horizon at 50%, 2-point perspective

Output: Corrected 3D structure maintaining visual coherence.`;
  }

  return `Translate 2D plan into a visually coherent 3D interior photograph.

STRUCTURE:
- Mask (white=walls) guides wall layout - should be visually consistent with the plan
- Translate 2D structure into 3D space with proper depth and perspective
- Wall layout should broadly match the plan - no new rooms or major partitions
- Minor visual adjustments for photographic coherence are acceptable

OPENINGS:
Render windows/doors where the floor plan clearly indicates them. If uncertain, keep walls solid (do not invent openings).

FURNITURE (SCALE ANCHORS):
- Include basic structural furniture: one main seating element and one table/surface
- Furniture must sit flush with the floor and align with walls
- Furniture anchors scale and helps establish proper 3D perspective

CAMERA:
- Inside room at 1.6m, looking straight forward
- Horizon at 50%, 2-point perspective
- Not top-down or aerial

LIGHTING:
- Primary: Through window/balcony portals
- Secondary: Interior lighting

STYLE:
${referenceBase64 ? '- Apply reference materials/colors' : ''}
- Create a visually coherent 3D interpretation with depth and perspective`;
};

export const buildStrictRenderingSystemPrompt = (params: RenderingPromptParams, previousImageBase64?: string): string => {
  const { isAlreadyVisualized } = params;

  if (isAlreadyVisualized) {
    return buildRenderingSystemPrompt(params);
  }

  const previousImageGuidance = previousImageBase64
    ? `CORRECTION MODE:
- Previous image (first image) shows the current structure
- Use it as a visual anchor for perspective and spatial relationships
- Correct only the detected issues (new walls, shifted openings, topology changes)
- Do NOT re-imagine the entire structure
- Preserve what is correct in the previous image`
    : '';

  return `ACT AS: Professional Interior Photographer.

TASK: Correct only detected issues in the 3D structure.

${previousImageGuidance}

GEOMETRY (VISUALLY CONSISTENT):
- Previous image shows the current structure - use it as visual anchor
- Structural mask (white=walls) guides wall layout - should be visually consistent
- Correct only detected issues (new walls, shifted openings, topology changes)
- Do NOT re-imagine the entire structure
- Preserve what is correct in the previous image

OPENINGS:
- Render where plan CLEARLY shows them
- If uncertain: keep wall solid

CAMERA & PERSPECTIVE:
- Eye level: 1.6m, looking straight forward
- Horizon: 50% from top
- 2-point perspective, zero-tilt

PRIORITY:
1. Visual plausibility and photographic coherence
2. Wall layout should be visually consistent with the plan
3. If uncertain, omit rather than guess

Output: Corrected 3D structure maintaining visual coherence.`;
};

