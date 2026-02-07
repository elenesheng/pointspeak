/**
 * Style editing prompts
 */

export interface StylePromptParams {
  objectDescription: string;
  proposedAction: string;
  isGlobalStyle: boolean;
  isFurniture?: boolean;
  isSurface?: boolean;
  hasReferenceImage?: boolean;
}

export const buildStyleAction = (params: StylePromptParams): string => {
  const { objectDescription, proposedAction, isGlobalStyle, isFurniture, isSurface, hasReferenceImage } = params;
  
  if (isGlobalStyle) {
    return `You are modifying an EXISTING ROOM IMAGE.

STRUCTURAL CONSTRAINTS (ABSOLUTE — NEVER CHANGE):
- Walls, wall thickness, corners, and room boundaries
- Doors: position, size, swing direction
- Windows: position, size, proportions
- Plumbing points (sinks, toilets, showers): fixed
- Electrical points (outlets, switches, built-in lighting): fixed

These elements MUST remain exactly as shown in the base image.
If uncertain, preserve the original structure.

CAMERA LOCK (CRITICAL):
- Preserve the exact camera position, height, tilt, yaw, and roll
- Preserve the exact focal length and perspective
- Preserve all vanishing points exactly
- Do NOT reframe, recrop, zoom, rotate, or re-angle the scene
- Do NOT simulate a new photograph
- This is NOT a new photograph, render, or re-imagining
- This is a pixel-level modification of the FIRST image only

STYLE APPLICATION TASK:

Use the REFERENCE IMAGE only as a STYLE CATALOG.

Apply the following from the reference image:
- Material choices (wood type, stone, metal finishes)
- Color palette and tonal balance
- Furniture style and typology (replace furniture if appropriate)
- Textile types (fabric, rugs, curtains)
- Lighting fixture style and warmth
- Decorative language (plants, art, accessories)

You MAY:
- Replace furniture with reference-style equivalents
- Add furniture if it improves function and does not block circulation
- Remove furniture that conflicts with the style

You MUST:
- Keep furniture scale realistic for THIS room
- Adapt furniture size to fit the existing space
- Maintain clear walkways and access to doors/windows

REFERENCE IMAGE RULES:

- The reference image is NOT the output.
- Do NOT copy the reference layout, room shape, or camera view.
- Do NOT recreate the reference room.

Instead:
- Translate the reference STYLE into the current room.
- Adapt proportions, furniture count, and placement to THIS space.
- If a reference element does not fit physically, OMIT it.

The final image must clearly be the ORIGINAL ROOM,
restyled with the reference aesthetic.

QUALITY REQUIREMENTS:
- Photorealistic materials and lighting
- Correct shadows and contact with floor
- No floating objects
- No warped geometry
- No new rooms, openings, or walls`;
  }
  
  // Object-specific style edits
  if (hasReferenceImage) {
    if (isFurniture) {
      // For furniture: REPLACE the entire object
      return `REPLACE the entire ${objectDescription} with a new object matching the reference image.

The new furniture piece must match the design, style, and material of the object in the reference image.
Replace the entire object - do not just change colors or materials.
Ensure the new object sits exactly in the current position and matches the room's perspective.
Shadows must be physically accurate to the floor beneath it.
Maintain the same general size and scale as the original object.`;
    } else if (isSurface) {
      // For surfaces: Apply material/texture (resurfacing)
      return `Apply the material from the reference image onto the existing ${objectDescription}.

MATERIAL RESURFACING TASK:
- Keep the current structure, size, and position
- Apply the reference material (e.g., the specific wood grain, tile pattern, or stone texture)
- The transition between the new material and adjacent objects must be seamless
- Match the exact texture, color, and finish from the reference`;
    }
  }
  
  // Default: General style change
  return `Change the ${objectDescription} appearance to ${proposedAction} style.

Update materials, finishes, colors, and design details.
Keep the same position, size, and shape.`;
};

