/**
 * Reusable prompt fragments
 */

export const REFERENCE_GUIDANCE_GLOBAL = (referenceMaterialDescription?: string) => {
  const styleDetails = referenceMaterialDescription 
    ? `\n\nREFERENCE ANALYSIS DETAILS:\n${referenceMaterialDescription}\n\nUse these EXACT specifications from the reference analysis.`
    : '';
  
  return `\n\nREFERENCE STYLE APPLICATION (CRITICAL - FOLLOW EXACTLY):

The FIRST image is your style reference. You MUST apply its EXACT style throughout this room:
${styleDetails}
- Match the EXACT materials, colors, textures, and finishes visible in the reference image
- Match the EXACT furniture styles, shapes, and arrangements from the reference where they fit the current layout
- Match the EXACT decorative elements, accessories, and styling details
- Match the EXACT lighting style, atmosphere, and overall aesthetic
- If the reference shows specific colors (e.g., Beige/Cream, Terracotta/Burnt Orange), use those EXACT colors
- If the reference shows specific materials (e.g., Matte Laminate, Glossy Ceramic Tile), use those EXACT materials

The SECOND image is the current room to edit. Transform it to match the reference style EXACTLY while preserving structure.

Preserve the existing room structure: wall positions, door locations, window positions, and plumbing fixtures stay exactly as they are.`;
};

export const REFERENCE_GUIDANCE_OBJECT = (referenceMaterialDescription?: string) => {
  const styleDetails = referenceMaterialDescription 
    ? `\n\nREFERENCE ANALYSIS DETAILS:\n${referenceMaterialDescription}\n\nUse these EXACT specifications from the reference analysis.`
    : '';
  
  return `\n\nREFERENCE STYLE APPLICATION (CRITICAL - FOLLOW EXACTLY):

The FIRST image is your style reference. You MUST apply its EXACT style to the target object:
${styleDetails}
- Match the EXACT materials, colors, textures, and finishes from the reference
- Match the EXACT shape and design details from the reference if appropriate
- Make the transformation clearly visible and match the reference precisely

The SECOND image is the current image. Transform the target object to match the reference style EXACTLY.
Keep the object in its current position and maintain room structure.`;
};

export const REFERENCE_GUIDANCE_TEXT = (referenceMaterialDescription: string) => {
  return `\n\nSTYLE APPLICATION (USE EXACT DETAILS):

Apply this EXACT style: ${referenceMaterialDescription}

You MUST use the EXACT materials, colors, textures, and finishes specified in the style description above.
Do not generalize or approximate - match the specifications precisely.`;
};

export const QUALITY_REFERENCE = `\n\nQUALITY REFERENCE (ORIGINAL IMAGE):

The reference image is the original uploaded photo. Use it as a quality target:
- Match the original image's sharpness, detail, and clarity
- Preserve the same level of texture fidelity and resolution
- Maintain the original lighting and color accuracy
- Do NOT copy the layout or content from the reference
- Only use it to ensure your output matches the original's visual quality

This reference is for QUALITY MATCHING only, not content copying.`;

