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
    return `Copy visible design features from the reference image to the room.
Preserve room layout and camera.
Transform materials, furniture, and decor to match the reference style.`;
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

