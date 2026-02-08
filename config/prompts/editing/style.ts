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
    // Global style: text-only mode (no reference image sent to generation)
    return `STYLE APPLICATION TASK:

Apply the style described in the text instructions below to THIS room photo.
All style details (materials, colors, furniture) are provided as text - follow them exactly.

You MAY:
- Replace furniture with the specified style equivalents
- Add furniture if specified in the plan and it does not block circulation
- Change materials and colors as specified

You MUST:
- Keep furniture scale realistic for THIS room
- Adapt furniture size to fit the existing space
- Maintain clear walkways and access to doors/windows
- Keep ALL structural elements (walls, doors, windows, plumbing) in exact positions

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
      // For surfaces: Apply material/texture from reference image (resurfacing)
      return `Re-texture the ${objectDescription} using the material shown in the SECOND (reference) image.

MATERIAL RESURFACING TASK:
- Extract the exact material pattern, color, grain, and texture from the SECOND image
- Map this material onto the ${objectDescription} in the FIRST image using correct perspective
- The material must tile/repeat naturally to cover the ENTIRE surface area
- Match the lighting and shadow conditions of the FIRST image on the new material
- The new material must follow the same perspective vanishing points as the original surface

SURFACE BOUNDARIES (ABSOLUTE - DO NOT CHANGE):
- The ${objectDescription} must cover the EXACT same area as the original
- Do NOT shrink, expand, or shift the surface boundaries
- Preserve all junctions where the surface meets walls, cabinets, appliances, or other objects
- If the original surface has sections (e.g., tile + wood), maintain those exact boundary lines

WHAT CHANGES: Only the material/texture/color of the ${objectDescription}
WHAT STAYS: Everything else - walls, cabinets, furniture, appliances, lighting, camera, dimensions`;
    }
  }
  
  // Default: General style change
  return `Change the ${objectDescription} appearance to ${proposedAction} style.

Update materials, finishes, colors, and design details.
Keep the same position, size, and shape.`;
};

