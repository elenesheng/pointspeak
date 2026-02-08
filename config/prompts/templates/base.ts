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

export const DIMENSION_CONSTRAINT = `
OUTPUT DIMENSIONS (ABSOLUTE - NEVER VIOLATE):
- Output MUST have EXACTLY the same pixel width as input (not ±1, not ±2, EXACT)
- Output MUST have EXACTLY the same pixel height as input (not ±1, not ±2, EXACT)
- Output MUST have EXACTLY the same aspect ratio as input
- Do NOT resize, crop, zoom, stretch, squish, or change image boundaries
- The output image frame must be PIXEL-PERFECT IDENTICAL to the input image frame
- If the input is 1920x1080, output must be 1920x1080 (not 1920x1079, not 1919x1080, not 2048x2048)
- DO NOT change canvas size under any circumstances
- The image dimensions are LOCKED and IMMUTABLE
`;

export const LAYOUT_PRESERVATION_CRITICAL = `
LAYOUT & PROPORTION PRESERVATION (ABSOLUTELY CRITICAL - DO NOT VIOLATE):
- The output image MUST have EXACTLY the same pixel dimensions as the input image
- The aspect ratio MUST remain IDENTICAL (e.g., if input is 16:9, output must be 16:9)
- The camera angle, perspective, and viewing position MUST remain EXACTLY the same
- All walls, structural elements, and room boundaries MUST stay in the EXACT same positions
- The image composition, framing, and field of view MUST remain unchanged
- Do NOT change the room layout, wall positions, or structural geometry
- Do NOT alter the perspective or camera viewpoint
- Do NOT resize, crop, or change image proportions in any way
- The output should look like the same photograph with only materials, colors, and furniture changed`;

export const GROUNDING = `You are editing an existing photo. Output must be a modified version of this exact image.`;

export const PRESERVATION_BASIC = `Preserve the existing room structure: wall positions, door locations, window positions, and plumbing fixtures remain unchanged.
Maintain the same lighting direction, image quality, camera perspective, and overall atmosphere.
Perspective: Maintain the same camera angle and depth of field.
Quality: Preserve the same image sharpness, detail level, and clarity throughout.`;

export const ROOM_IDENTITY_LOCK = `
CONSTRAINTS:
- Same room, same camera, same layout
- Only change materials, furniture, decor`;

export const PROHIBITED_BEHAVIOR = `
Apply features directly from the reference image.`;

export const SPATIAL_AWARENESS_CONSTRAINTS = `
SPATIAL AWARENESS RULES (CRITICAL):
- Maintain clear walkways: Minimum 36 inches (91cm) width for main paths, 18 inches (46cm) for secondary paths
- Keep plumbing fixtures accessible: No furniture blocking sinks, toilets, showers, or dishwashers
- Preserve natural light: Do not place tall furniture or objects that block windows
- Respect door swings: Ensure furniture doesn't interfere with door opening/closing
- Maintain HVAC access: Do not block vents or air returns
- Use scene inventory to identify existing objects and plan new furniture placement to avoid conflicts
- Scale appropriately: Match furniture size to room proportions

STRUCTURAL ELEMENTS (PRESERVE):
- Keep doors, windows, plumbing fixtures, and appliances in their current positions
- Only change materials and colors of structural elements, not their location or type`;

/**
 * Canonical reference image usage rule - SINGLE SOURCE OF TRUTH
 * Use this exact block when reference images are provided for style transfer
 */
export const REFERENCE_IMAGE_USAGE_RULE = `
REFERENCE IMAGE USAGE:
- Use the SECOND image (reference) for materials, colors, and furniture design only
- Keep the FIRST image's camera, perspective, and layout exactly as shown
- Apply style features, not photographic features
- Do NOT copy the reference's camera angle or composition`;

/**
 * Canonical scale normalization rule - SINGLE SOURCE OF TRUTH
 * Use this exact block when copying objects from reference images
 */
export const SCALE_NORMALIZATION_RULE = `
SCALE:
- Copy design from Image 1, but scale objects to fit the current room naturally`;

/**
 * Camera and geometry lock rule - CRITICAL for preventing perspective changes
 * This must be injected BEFORE style instructions to lock camera pose
 */
export const CAMERA_LOCK_RULE = `
CAMERA & GEOMETRY LOCK (ABSOLUTE – DO NOT VIOLATE):

- Preserve the exact camera position, height, tilt, yaw, and roll from the FIRST image
- Preserve the exact focal length and perspective
- Preserve all vanishing points exactly
- Do NOT reframe, recrop, zoom, rotate, or re-angle the scene
- Do NOT simulate a new photograph
- Treat the FIRST image as a fixed camera plate
- All edits must be painted onto this fixed camera view
- This is NOT a new photograph, render, or re-imagining
- This is a pixel-level modification of the FIRST image only
`;

