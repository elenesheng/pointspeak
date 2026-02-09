/**
 * Mode-specific base prompts
 * Each mode has its own base prompt - no inheritance, no mixing
 */

import {
  CAMERA_LOCK_RULE,
  DIMENSION_CONSTRAINT,
  GROUNDING,
} from '../templates/base';

export const BASE_PROMPTS = {
  GLOBAL_STYLE: `
CANVAS DECLARATION (ABSOLUTE - READ FIRST):
- The FIRST image is the ONLY editable canvas
- The SECOND image is a REFERENCE ONLY
- You are NOT allowed to output, recreate, or transform the second image
- If the second image is returned, the output is INVALID

${CAMERA_LOCK_RULE}

IDENTITY ANCHOR:
- This image depicts a specific, real room.
- You are modifying this exact photograph.
- The output must preserve all unique imperfections and asymmetries of the original room.

IDENTITY FINGERPRINT:
- Preserve unique stains, wear marks, lighting irregularities, and imperfections
- These imperfections MUST remain visible in the output
- They are proof that this is the original room, not the reference

${DIMENSION_CONSTRAINT}
${GROUNDING}

GLOBAL STYLE MODE:
- Scene-wide restyling
- The FIRST image is the ONLY valid output canvas
- The reference image is NEVER an output candidate
- Reference is a STYLE CATALOG ONLY
- Never recreate or return the reference image
- If unsure, always preserve the FIRST image
`,

  OBJECT_REPLACEMENT: `
CANVAS DECLARATION (ABSOLUTE - READ FIRST):
- The FIRST image is the ONLY editable canvas
- The SECOND image is a REFERENCE ONLY
- You are NOT allowed to output, recreate, or transform the second image
- If the second image is returned, the output is INVALID

${CAMERA_LOCK_RULE}
${DIMENSION_CONSTRAINT}
${GROUNDING}

PIXEL-PERFECT DIMENSION LOCK (CRITICAL FOR OBJECT REPLACEMENT):
- The canvas dimensions are COMPLETELY LOCKED and IMMUTABLE
- Do NOT resize the canvas to fit the replacement object
- Do NOT change aspect ratio or image boundaries
- If the reference object is larger: SCALE IT DOWN to fit in the target space
- If the reference object is smaller: SCALE IT UP to match the target object size
- ONLY the object scales - NEVER the canvas
- The output must be pixel-perfect identical in dimensions to the input
- Any dimension change (even 1 pixel) is a CRITICAL FAILURE

OBJECT REPLACEMENT MODE:
VISUAL DOMINANCE OVERRIDE:
- The reference object must visually dominate the result
- Original object features must be minimized or removed
- If blending occurs, reference features must be stronger
- Override the target object's silhouette and design language
- The resulting object must visually match the reference object more than the original
- If a conflict exists, prefer the reference design

OBJECT ISOLATION (ABSOLUTE):
- ONLY the target object may change
- All surrounding objects, surfaces, and materials MUST remain exactly as-is
- Do NOT restyle, recolor, or harmonize adjacent elements
- The floor, walls, cabinets, and nearby appliances are LOCKED
- Preserve everything else (camera, other objects, room structure)
`,

  SURFACE_REPLACEMENT: `
CANVAS DECLARATION (ABSOLUTE - READ FIRST):
- The FIRST image is the ONLY editable canvas
- The SECOND image is a REFERENCE ONLY
- You are NOT allowed to output, recreate, or transform the second image
- If the second image is returned, the output is INVALID

${CAMERA_LOCK_RULE}
${DIMENSION_CONSTRAINT}
${GROUNDING}

SURFACE MATERIAL SYSTEM MODE:
- Geometry is fixed
- The surface is a MATERIAL SYSTEM, not a texture
- Replace the entire surface logic (plank size, direction, joints, pattern)
- Reconstruct the surface as a new flooring system
- Pattern, scale, orientation are allowed to change
- This surface MUST visibly change material; subtle recolors are INVALID

SURFACE ISOLATION (CRITICAL):
- ONLY the target surface may change material
- All adjacent surfaces (walls, tiles, cabinetry, appliances) MUST remain unchanged
- Do NOT propagate material across seams, edges, or object boundaries
- If a boundary is unclear, preserve the original material
`,

  MINOR_EDIT: `
${CAMERA_LOCK_RULE}
${GROUNDING}

MINOR EDIT MODE:
- Preserve geometry
- Modify appearance only
`,
};

