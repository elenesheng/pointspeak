/**
 * Multi-stage rendering prompts
 */

export interface MultiStagePromptParams {
  styleDescription: string;
  objectContext: string;
  referenceBase64: string | null;
}

export const buildStyleProjection = (styleDescription: string): string => {
  return `STYLE TRANSLATION FOR ROOM APPLICATION:

Use the reference style as a MATERIAL LANGUAGE, not a literal object.

Interpret the style as follows:
- Apply similar material qualities (texture, finish, color tone) to appropriate room surfaces
- Upholstered textures → soft fabrics (sofas, chairs, cushions)
- Color palette → walls, accents, decor
- Finish qualities → cabinetry, furniture surfaces

Do NOT replicate the reference object itself.
Do NOT introduce new furniture, doors, or windows.

Style Description: ${styleDescription}`;
};

export const getStage1StructurePrompt = (): string => {
  return `Generate an 'ARCHITECTURAL WHITE MODEL' (Clay Render).

TASK: Define the 'Structural Shell' - establish correct 3D PERSPECTIVE geometry and spatial structure.

CRITICAL: This is a 3D PERSPECTIVE render, NOT a 2D map. You are a photographer standing INSIDE the room.

PERSPECTIVE GEOMETRY (3D VIEW):
- Camera at human eye level (1.6m) at room entrance
- You are standing INSIDE the room, looking STRAIGHT forward
- 2-point linear perspective with horizon line at center (50% from top)
- Zero-Tilt: All vertical lines (walls, door frames) perfectly parallel to image edges
- Floor at bottom receding, ceiling at top receding, walls on sides converging
- Vanishing points on the horizon line
- Do NOT output a top-down, aerial, or bird's-eye view

3D EXTRUSION:
- EXTRUDE the white lines from the Structural Mask into 3D walls
- Every line from the 2D floor plan must be extruded vertically into 3D space
- The 2D Plan is a MAP; this output MUST be a 3D PERSPECTIVE VIEW

PORTAL RULE (CRITICAL):
- Do NOT extrude every white line into a solid block.
- IDENTIFY OPENINGS: Cross-reference the Structural Mask with the Floor Plan.
- WINDOWS/DOORS: Where the plan shows a window or balcony door, create a VOID or a RECTANGULAR OPENING in the wall.
- Result: A 3D shell where you can see through the window positions into the exterior space.
- SIGHTLINES: Ensure windows and balcony doors are transparent openings, not solid walls.

ARCHITECTURAL WHITE MODEL STYLE:
- Purpose: Define the 'Structural Shell' in 3D perspective
- Appearance: Matte white walls, black floor, neutral lighting. No textures.
- Windows/Doors: Show as dark voids or openings (not solid white)
- Focus on light and shadow over volume (ambient occlusion)
- NO decorative details, furniture, or styling yet
- NO textures or patterns - just clean geometric forms in 3D space

SPATIAL MAPPING RULE:
1. Use the Structural Mask (black/white image) for POSITION (where walls are)
2. Use the Floor Plan image for SEMANTICS (what type: solid wall vs. glass portal)
3. White pixels in mask = structural elements, but check the plan to determine if they're solid walls or glass openings
4. Every corner in the 2D map must have a corresponding corner in the 3D view. No 'ghost' walls or 'hallucinated' alcoves.

This stage is ONLY about establishing correct 3D spatial structure with proper eye-level perspective and identifying structural openings.`;
};

export const buildStage2StylePrompt = (params: MultiStagePromptParams): string => {
  const { styleDescription, objectContext, referenceBase64 } = params;
  
  const styleProjection = buildStyleProjection(styleDescription);
  
  return `Add realistic materials, furniture, and styling to this 3D interior view.

CRITICAL PRESERVATION:
- Preserve the existing perspective geometry EXACTLY (same camera angle, viewpoint, spatial structure)
- Maintain vertical lines parallel to edges
- Keep horizon line at center
- Do NOT change wall positions, room boundaries, or spatial relationships
- IDENTIFY GLASS PORTALS: Preserve any window or balcony door openings as transparent glass, not solid walls

STYLE APPLICATION:
${styleProjection}
${objectContext}

WINDOW TREATMENT:
- Windows should show a realistic exterior view or a soft photographic 'bloom' of natural daylight
- Ensure the balcony door is clearly glass and visually accessible
- Windows must remain transparent portals - do not block them with solid geometry
- Primary light MUST enter through window/balcony portals

PHOTOGRAPHY:
- Professional interior photography lighting
- Natural light from existing window positions
- Maintain image quality and sharpness`;
};

