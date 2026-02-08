import { CAMERA_LOCK_RULE } from './base';
/**
 * Reusable prompt fragments
 */

export const PIXEL_EDIT_CONTRACT = `
PIXEL-LEVEL EDIT CONTRACT (ABSOLUTE):

- You are performing an IN-PLACE pixel edit on an existing bitmap
- The input image defines a FIXED pixel grid
- Output MUST preserve identical width, height, and aspect ratio
- You are NOT generating a new image
- You are NOT allowed to crop, pad, zoom, rescale, or reframe

MASKED EDIT RULE:
- Only pixels belonging to the target object/surface may change
- All other pixels MUST remain identical to the input image
- Treat the edit as if a precise mask is applied

If this contract cannot be satisfied, the output is INVALID.
`;

export const REFERENCE_GUIDANCE_GLOBAL = (referenceMaterialDescription?: string, stylePlan?: any) => {
  // GLOBAL_STYLE: No reference image is sent to generation model.
  // All style details come from the text-based reasoning analysis (stylePlan).
  // This prevents the model from copying the reference image's layout/angle/walls.

  const planInstructions = stylePlan?.execution_instructions
    ? `\n\nEXECUTION PLAN (BINDING CONTRACT):\n${stylePlan.execution_instructions}\n\nThis plan is a BINDING CONTRACT - execute it literally and precisely.`
    : '';

  const materialsList = stylePlan?.application_strategy?.materials_to_apply?.length
    ? `\n\nMATERIALS TO APPLY (EXECUTE EXACTLY):\n${stylePlan.application_strategy.materials_to_apply.map((m: any) => {
        if (typeof m === 'string') {
          return `- ${m}`;
        } else {
          return `- ${m.surface}: ${m.material} (${m.finish} finish, ${m.color})`;
        }
      }).join('\n')}\n\nApply each material to its specified surface exactly.`
    : '';

  const furnitureGuidance = stylePlan?.application_strategy?.furniture_to_add?.length || stylePlan?.application_strategy?.furniture_to_replace?.length
    ? `\n\nFURNITURE STRATEGY:\n${stylePlan.application_strategy.furniture_to_add?.length ? `ADD: ${stylePlan.application_strategy.furniture_to_add.join(', ')}\n` : ''}${stylePlan.application_strategy.furniture_to_replace?.length ? `REPLACE: ${stylePlan.application_strategy.furniture_to_replace.join(', ')}\n` : ''}${stylePlan.application_strategy.placement_guidelines?.length ? `\nPLACEMENT GUIDELINES:\n${stylePlan.application_strategy.placement_guidelines.map((g: string) => `- ${g}`).join('\n')}` : ''}`
    : '';

  const featureEnumeration = stylePlan?.application_strategy?.materials_to_apply?.length
    ? `\n\nMATERIAL INSTRUCTIONS:\n${stylePlan.application_strategy.materials_to_apply.map((m: any) => {
        if (typeof m === 'string') {
          return `- ${m}`;
        } else {
          return `- ${m.surface}: Apply ${m.material} material with ${m.finish} finish in ${m.color}`;
        }
      }).join('\n')}`
    : '';

  const furnitureEnumeration = stylePlan?.application_strategy?.furniture_to_add?.length || stylePlan?.application_strategy?.furniture_to_replace?.length
    ? `\n\nFURNITURE INSTRUCTIONS:\n${stylePlan.application_strategy.furniture_to_add?.map((f: string) => `- ADD: ${f}`).join('\n') || ''}${stylePlan.application_strategy.furniture_to_replace?.map((f: string) => `- REPLACE with: ${f}`).join('\n') || ''}`
    : '';

  const colorList = stylePlan?.reference_analysis?.color_palette?.length
    ? `\n\nCOLOR PALETTE TO USE:\n${stylePlan.reference_analysis.color_palette.map((c: string) => `- ${c}`).join('\n')}`
    : '';

  // NEW: Spatial adaptation guidance from architect analysis
  const spatialAdaptation = stylePlan?.spatial_adaptation?.furniture_scale_adjustments?.length
    ? `\n\nSPATIAL ADAPTATION (ARCHITECT-LEVEL INTELLIGENCE):\n${stylePlan.spatial_adaptation.furniture_scale_adjustments.map((adj: any) => {
        return `- ${adj.item}:\n  Reference: ${adj.reference_size}\n  Target: ${adj.target_size}\n  Reasoning: ${adj.reasoning}`;
      }).join('\n')}\n\nApply these scale adjustments to maintain proportional, intelligent design.`
    : '';

  const layoutAdaptations = stylePlan?.spatial_adaptation?.layout_adaptations?.length
    ? `\n\nLAYOUT ADAPTATIONS:\n${stylePlan.spatial_adaptation.layout_adaptations.map((adapt: string) => `- ${adapt}`).join('\n')}`
    : '';

  const materialPriorities = stylePlan?.spatial_adaptation?.material_priorities?.length
    ? `\n\nMATERIAL PRIORITIES:\n${stylePlan.spatial_adaptation.material_priorities.map((priority: string) => `- ${priority}`).join('\n')}`
    : '';

  const designRationale = stylePlan?.design_rationale
    ? `\n\nARCHITECT'S DESIGN RATIONALE:\n${stylePlan.design_rationale}\n\nFollow this professional reasoning when applying the style.`
    : '';

  const executionGuidance = stylePlan
    ? `\n\nSTYLE PLAN EXECUTION (CRITICAL):
- The style instructions above were created by a senior architect analyzing both spaces
- Execute each instruction EXACTLY as specified
- Use the EXACT colors, materials, and furniture described
- Apply the scale adjustments and layout adaptations thoughtfully
- Maintain design cohesion while respecting spatial constraints`
    : referenceMaterialDescription
    ? `\n\nAPPLY THIS STYLE:
- Use the exact materials and colors described: ${referenceMaterialDescription}
- Apply them to the current room while preserving all structure`
    : '';

  return `\n\nSTYLE TRANSFER (TEXT-BASED - SINGLE IMAGE MODE):
- You have ONLY ONE image: the current room photo
- Apply the materials, colors, and furniture specified below to THIS image
- There is NO second image - all style details are provided as text instructions
- Do NOT change the room layout, wall positions, camera angle, or proportions
- Do NOT change the room shape, size, or structural elements
- Every wall, door, window must stay in its EXACT pixel position
- Only change: materials, colors, furniture design, decor, lighting fixtures
- The output must clearly be the SAME photograph, restyled

${colorList}${featureEnumeration}${furnitureEnumeration}${materialsList}${furnitureGuidance}${spatialAdaptation}${layoutAdaptations}${materialPriorities}${planInstructions}${designRationale}${executionGuidance}`;
};

export const REFERENCE_GUIDANCE_OBJECT = (referenceMaterialDescription?: string, isFurniture?: boolean) => {
  const styleDetails = referenceMaterialDescription
    ? `\n\nREFERENCE ANALYSIS DETAILS:\n${referenceMaterialDescription}\n\nUse these EXACT specifications from the reference analysis.`
    : '';

  if (isFurniture) {
    return `\n\nREFERENCE STYLE APPLICATION (CRITICAL - FOLLOW EXACTLY):

The FIRST image is the CURRENT ROOM (your editable canvas).
The SECOND image is the REFERENCE (style guide only - NEVER output it).

${PIXEL_EDIT_CONTRACT}

${styleDetails}

TASK: REPLACE the target object in the FIRST image with a new object matching the SECOND image's style:
- REPLACE the entire object - match the EXACT design, shape, and material from the SECOND (reference) image
- The new object must match the reference object's style, proportions, and details
- Place the replacement in the EXACT same position as the original object in the FIRST image
- Match the room's perspective, lighting, and shadows from the FIRST image
- Shadows must be physically accurate to the floor beneath it
- Output MUST be the FIRST image modified - NEVER output the SECOND image
- Output MUST have EXACTLY the same pixel dimensions as the FIRST image
- Do NOT crop, resize, zoom, or change image boundaries
- Scale the replacement object to fit naturally in the original object's space`;
  }

  return `\n\nSURFACE MATERIAL REPLACEMENT (CRITICAL - FOLLOW EXACTLY):

The FIRST image is the CURRENT ROOM (your editable canvas).
The SECOND image shows the MATERIAL/TEXTURE to apply (reference only - NEVER output it).
${styleDetails}

TASK: Re-texture the target surface in the FIRST image using the material from the SECOND image:
- Extract the material pattern, color, and texture from the SECOND image
- Map this material onto the target surface in the FIRST image using correct perspective
- The material must tile/repeat naturally to cover the ENTIRE surface area
- Match the lighting and shadows of the FIRST image on the new material
- The new material must follow the same perspective lines as the original surface

SURFACE BOUNDARIES (ABSOLUTE):
- The surface must cover the EXACT same area as the original - no shrinking, no expanding
- Do NOT change where the surface meets walls, cabinets, or other objects
- Do NOT change the surface boundaries, edges, junctions, or extent
- Preserve all surface-to-wall and surface-to-object transitions exactly

ISOLATION (ABSOLUTE):
- ONLY the target surface changes material
- All walls, cabinets, appliances, furniture, and other objects remain EXACTLY as-is
- Do NOT change any colors or materials on adjacent surfaces
- Do NOT propagate the new material across boundaries

OUTPUT CONSTRAINTS:
- Output MUST be the FIRST image modified - NEVER output the SECOND image
- Output MUST have EXACTLY the same pixel dimensions as the FIRST image
- Do NOT crop, resize, zoom, or change image boundaries`;
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

