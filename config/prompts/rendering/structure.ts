/**
 * Rendering prompts for 2D to 3D conversion
 */

export interface RenderingPromptParams {
  styleDescription: string;
  isAlreadyVisualized: boolean;
  referenceBase64: string | null;
  objectContext: string;
}

export const buildRenderingSystemPrompt = (params: RenderingPromptParams): string => {
  const { styleDescription, isAlreadyVisualized, referenceBase64, objectContext } = params;

  const styleProjection = `STYLE TRANSLATION FOR ROOM APPLICATION:

Use the reference style as a MATERIAL LANGUAGE, not a literal object.

Interpret the style as follows:
- Apply similar material qualities (texture, finish, color tone) to appropriate room surfaces
- Upholstered textures → soft fabrics (sofas, chairs, cushions)
- Color palette → walls, accents, decor
- Finish qualities → cabinetry, furniture surfaces

Do NOT replicate the reference object itself.
Do NOT introduce new furniture, doors, or windows.

Style Description: ${styleDescription}`;

  const geometryDeAuth = referenceBase64
    ? `\n\nREFERENCE IMAGE RULE (CRITICAL):

The reference image is for MATERIAL, COLOR, and LIGHTING inspiration ONLY.

It does NOT represent:
- layout
- openings
- doors
- windows
- wall positions
- room proportions

You must NOT copy or infer architectural elements from the reference image.`
    : '';

  const structurePreservation = isAlreadyVisualized ? `
ARCHITECTURAL SHELL (IMMUTABLE):
You are applying materials to a FIXED GEOMETRIC SHELL. The structural elements are ANCHORS that cannot move.

PRESERVATION RULES:
- WALLS: Same positions, angles, lengths (LOAD-BEARING - cannot be moved, thinned, or removed)
- DOORS: Same positions and sizes (no additions or removals)
- WINDOWS: Same positions, sizes, shapes (no changes to locations)
- ROOM DIMENSIONS: Same sizes, proportions, spatial relationships
- FURNITURE: Same positions and orientations (footprints are fixed)
- ARCHITECTURAL OPENINGS: Same archways and structural elements

MATERIAL MAPPING ONLY:
- Update: Surface materials, colors, textures, lighting, decorative elements
- Preserve: All structural geometry, layout, and spatial relationships

The input image defines the EXACT structural shell. The mask (white=walls, black=open space) is the SOURCE OF TRUTH for layout.
` : `
SPATIAL MAPPING RULE:
1. Use the [Structural Mask] to define the 1:1 floor-to-ceiling volume
2. The White pixels in the mask are LOAD-BEARING. They cannot be moved, thinned, or removed
3. Treat the 2D Plan as the blueprint; treat the 3D Render as the material application only

The structural mask (white=walls, black=open space) defines immutable boundaries.
`;

  return `ACT AS: A Professional Interior Photographer. Your task is to create a 3D eye-level photograph from architectural plans.

${isAlreadyVisualized ? `
TASK: Re-render this existing 3D visualization. Update materials, lighting, and finishes while maintaining a 1:1 architectural match to the input structure.

ARCHITECTURAL FIDELITY (IMMUTABLE):
- Geometry: Every wall angle and floor-to-ceiling boundary must remain identical to the input
- Openings: Do not add, remove, or shift the positions of windows and doors
- Furniture: Maintain the existing footprint and orientation of all furniture pieces
- Room boundaries: Match the exact room shapes and proportions from the input image

STYLE & MATERIAL SPECIFICATION:
- Reference Image: Use solely for color palette, material textures (e.g., matte oak, brushed brass), and lighting mood
- Style Description: ${styleDescription}

The walls, doors, and windows provided in the input are IMMUTABLE ANCHORS. Only update visual appearance (materials/colors), not the layout.

LIGHT SOURCE: All light must originate from the WINDOW positions defined in the input image. If no window is present in a section, use realistic interior recessed lighting.
` : `
TASK: Generate a photorealistic 3D interior photograph from this floor plan.

You are a photographer standing INSIDE the room. The floor plan is a MAP; your output MUST be a 3D PERSPECTIVE VIEW.

The walls, doors, and windows defined in the floor plan are IMMUTABLE ANCHORS. Your role is to EXTRUDE the 2D lines into 3D walls and apply materials and styling.

LIGHT SOURCE: All light must originate from the WINDOW positions defined in the floor plan. If no window is present in a section of the mask, use realistic interior recessed lighting.
`}

ARCHITECTURAL PHOTOGRAPHY STANDARDS:
Create a professional interior photograph with correct eye-level perspective.

Camera Setup:
- Position: Standing at room entrance at human eye level (1.6 meters / 5.3 feet above floor)
- Angle: Looking horizontally forward into the room
- Perspective: 2-point linear perspective with vanishing points on the horizon line
- Lens: Professional wide-angle interior photography (approximately 24mm equivalent)
- Viewpoint: First-person perspective as if standing in the doorway

Visual Requirements:
- Horizon line centered vertically (approximately 50% from top) to enforce eye-level perspective
- Zero-Tilt: All vertical edges must be 90° to the horizon (walls, door frames, window frames perfectly parallel to image edges)
- Floor visible at bottom of image, receding into distance with proper perspective
- Ceiling visible at top of image, also receding
- Left and right walls visible on sides, converging to vanishing points on the horizon
- Furniture at natural human scale relative to viewer

Plan Fidelity: Every corner in the 2D map must have a corresponding corner in the 3D view. No 'ghost' walls or 'hallucinated' alcoves.

The output should match professional interior photography standards with correct perspective geometry.

${structurePreservation}
${objectContext}

${styleProjection}
${geometryDeAuth}

Output a photorealistic interior photograph ${isAlreadyVisualized ? 'matching the existing layout' : 'from the floor plan'} with correct eye-level perspective.`;
};

export const getRenderingInstruction = (isAlreadyVisualized: boolean, referenceBase64: string | null): string => {
  if (isAlreadyVisualized) {
    return `RE-RENDER TASK: Update materials/lighting.

STRICT GEOMETRY LOCK:
- Use the input image as the FIXED SHELL.
- IDENTIFY GLASS: Look for windows and balcony doors in the input. These must remain GLASS PORTALS.
- Do NOT replace glass openings with solid walls. Ensure natural light enters through these portals.

QUALITY:
- Professional photography lighting. Output a high-fidelity 3D render.`;
  }

  return `3D EXTRUSION TASK: 2D Plan to 3D Photograph.

SPATIAL AUTHORITY:
- Use the Structural Mask (black/white image) for POSITION.
- Use the Floor Plan image for SEMANTICS:
    - IDENTIFY PORTALS: Look for window and door symbols in the Floor Plan.
    - RULE: If a line in the mask corresponds to a window or balcony door symbol in the plan, render it as a GLASS OPENING (Portal), not a solid wall.
    - SIGHTLINES: Ensure you can see "through" windows and balcony doors. Do not block them with solid geometry.
- EXTRUDE solid wall lines into 3D walls. Do not move them.
- The 2D Plan is a MAP; the output MUST be a 3D PERSPECTIVE VIEW.

CAMERA POSITION (CRITICAL):
- You are a photographer standing INSIDE the room at 1.6m height.
- Look STRAIGHT forward. Horizon line MUST be at the 50% vertical mark.
- Do NOT output a top-down, aerial, or bird's-eye view.

PERSPECTIVE REQUIREMENTS:
- Zero-Tilt: All vertical architectural lines perfectly parallel to image edges
- Floor at bottom, ceiling at top, walls converging on sides
- 2-point perspective with vanishing points on horizon
- Plan Fidelity: Every corner in the 2D map must have a corresponding corner in the 3D view. No 'ghost' walls or 'hallucinated' alcoves.

LIGHTING:
- Primary light MUST enter through the identified Window/Balcony portals.
- Secondary: Warm interior architectural lighting.

STYLE:
${referenceBase64 ? '- Apply the materials and colors from the Reference Image while keeping the 3D volume empty and spacious.' : ''}
- Translate 2D style into 3D materials. A flat color on a 2D map should become a textured material with light and shadow in the 3D view.
- Output a professional interior photograph with realistic depth and perspective.`;
};

