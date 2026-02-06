/**
 * Reusable prompt fragments
 */

export const REFERENCE_GUIDANCE_GLOBAL = (referenceMaterialDescription?: string, stylePlan?: any) => {
  const styleDetails = referenceMaterialDescription 
    ? `\n\nREFERENCE ANALYSIS DETAILS:\n${referenceMaterialDescription}\n\nUse these EXACT specifications from the reference analysis.`
    : '';
  
  const planInstructions = stylePlan?.execution_instructions
    ? `\n\nREASONING-BASED EXECUTION PLAN (BINDING CONTRACT):\n${stylePlan.execution_instructions}\n\nThis plan is a BINDING CONTRACT - execute it literally and precisely. Do NOT treat it as suggestions or options. Follow this plan exactly while maintaining layout and proportions.`
    : '';
  
  const materialsList = stylePlan?.application_strategy?.materials_to_apply?.length
    ? `\n\nMATERIALS TO APPLY (from reasoning analysis - EXECUTE EXACTLY):\n${stylePlan.application_strategy.materials_to_apply.map((m: any) => {
        if (typeof m === 'string') {
          // Legacy format - just string
          return `- ${m}`;
        } else {
          // New format - object with surface mapping
          return `- ${m.surface}: ${m.material} (${m.finish} finish, ${m.color})`;
        }
      }).join('\n')}\n\nThese are BINDING instructions - apply each material to its specified surface exactly.`
    : '';
  
  const furnitureGuidance = stylePlan?.application_strategy?.furniture_to_add?.length || stylePlan?.application_strategy?.furniture_to_replace?.length
    ? `\n\nFURNITURE STRATEGY (from reasoning analysis):\n${stylePlan.application_strategy.furniture_to_add?.length ? `ADD: ${stylePlan.application_strategy.furniture_to_add.join(', ')}\n` : ''}${stylePlan.application_strategy.furniture_to_replace?.length ? `REPLACE: ${stylePlan.application_strategy.furniture_to_replace.join(', ')}\n` : ''}${stylePlan.application_strategy.placement_guidelines?.length ? `\nPLACEMENT GUIDELINES:\n${stylePlan.application_strategy.placement_guidelines.map((g: string) => `- ${g}`).join('\n')}` : ''}`
    : '';
  
  // Build concrete feature enumeration from style plan
  const featureEnumeration = stylePlan?.application_strategy?.materials_to_apply?.length
    ? `\n\nCOPY THESE VISIBLE FEATURES FROM THE REFERENCE IMAGE:\n${stylePlan.application_strategy.materials_to_apply.map((m: any) => {
        if (typeof m === 'string') {
          return `- ${m}`;
        } else {
          return `- ${m.surface}: Copy ${m.material} material with ${m.finish} finish in ${m.color}`;
        }
      }).join('\n')}`
    : '';

  const furnitureEnumeration = stylePlan?.application_strategy?.furniture_to_add?.length || stylePlan?.application_strategy?.furniture_to_replace?.length
    ? `\n\nCOPY THESE FURNITURE ITEMS FROM THE REFERENCE IMAGE:\n${stylePlan.application_strategy.furniture_to_add?.map((f: string) => `- ADD: ${f}`).join('\n') || ''}${stylePlan.application_strategy.furniture_to_replace?.map((f: string) => `- REPLACE with: ${f}`).join('\n') || ''}`
    : '';

  const colorList = stylePlan?.reference_analysis?.color_palette?.length
    ? `\n\nUSE ONLY THESE COLORS FROM IMAGE 1:\n${stylePlan.reference_analysis.color_palette.map((c: string) => `- ${c}`).join('\n')}`
    : '';

  return `\n\nCOPY VISIBLE FEATURES FROM IMAGE 1 TO IMAGE 2.

CONSTRAINTS:
- Same room, same camera, same layout
- Don't block paths or plumbing

${colorList}${featureEnumeration}${furnitureEnumeration}${materialsList}${furnitureGuidance}${planInstructions}

Copy the design and style of materials, furniture, and decorative elements from Image 1.
The SECOND image is the current room.`;
};

export const REFERENCE_GUIDANCE_OBJECT = (referenceMaterialDescription?: string, isFurniture?: boolean) => {
  const styleDetails = referenceMaterialDescription 
    ? `\n\nREFERENCE ANALYSIS DETAILS:\n${referenceMaterialDescription}\n\nUse these EXACT specifications from the reference analysis.`
    : '';
  
  if (isFurniture) {
    return `\n\nREFERENCE STYLE APPLICATION (CRITICAL - FOLLOW EXACTLY):

The FIRST image is your style reference. You MUST REPLACE the target object with the reference object:
${styleDetails}
- REPLACE the entire object - match the EXACT design, shape, and material from the reference
- The new object must match the reference object's style, proportions, and details
- Ensure the replacement sits exactly in the current position and matches the room's perspective
- Shadows must be physically accurate to the floor beneath it
- Make the replacement clearly visible and match the reference precisely

The SECOND image is the current image. Replace the target object with the reference object EXACTLY.
Keep the object in its current position and maintain room structure.`;
  }
  
  return `\n\nREFERENCE STYLE APPLICATION (CRITICAL - FOLLOW EXACTLY):

The FIRST image is your style reference. You MUST apply its EXACT material/texture to the target object:
${styleDetails}
- Apply the EXACT materials, colors, textures, and finishes from the reference
- Keep the current structure, size, and position - only change the material/surface
- The transition between the new material and adjacent objects must be seamless
- Make the transformation clearly visible and match the reference precisely

The SECOND image is the current image. Transform the target object's material to match the reference EXACTLY.
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

