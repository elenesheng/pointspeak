/**
 * Base prompt templates and reusable fragments
 */

export const BASE_ROLE = "ACT AS: A Professional Interior Designer and Photographer.";

export const ARCHITECTURAL_FIDELITY = `
### ARCHITECTURAL FIDELITY (IMMUTABLE)
- Glass Portals: Windows and balcony doors are fixed. Do NOT paint over them with solid materials; maintain transparency.
- Zero-Tilt: All vertical lines of walls and cabinetry must remain 90° to the horizon.
- Structural Shell: Do not move walls, doors, or windows. Use the provided mask as the absolute spatial truth.
- Resolution: Maintain the original image sharpness and detail frequency.`;

export const DIMENSION_CONSTRAINT = `Output: Same width, height, aspect ratio as input. No resize or crop.`;

export const GROUNDING = `You are editing an existing photo. Output must be a modified version of this exact image.`;

export const PRESERVATION_BASIC = `Preserve the existing room structure: wall positions, door locations, window positions, and plumbing fixtures remain unchanged.
Maintain the same lighting direction, image quality, camera perspective, and overall atmosphere.
Perspective: Maintain the same camera angle and depth of field.
Quality: Preserve the same image sharpness, detail level, and clarity throughout.`;

