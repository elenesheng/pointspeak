/**
 * Main editing prompt builder
 * Combines all editing action types
 */

import { buildStyleAction, StylePromptParams } from './style';
import { buildRemoveAction, RemovePromptParams } from './remove';
import { buildMoveAction, MovePromptParams } from './move';
import { buildInternalModifyAction, InternalModifyPromptParams } from './internal';
import { buildAlignmentAction, AlignmentPromptParams } from './alignment';
import { buildDefaultAction, DefaultEditPromptParams } from './default';
import { DIMENSION_CONSTRAINT, GROUNDING, PRESERVATION_BASIC } from '../templates/base';
import { REFERENCE_GUIDANCE_GLOBAL, REFERENCE_GUIDANCE_OBJECT, REFERENCE_GUIDANCE_TEXT, QUALITY_REFERENCE } from '../templates/fragments';

export interface EditingPromptParams {
  objectDescription: string;
  sourceCoords: string;
  translation: {
    operation_type: string;
    proposed_action: string;
  };
  identifiedObject: {
    id: string;
    name: string;
    box_2d?: [number, number, number, number] | null;
  };
  targetObject?: {
    position?: string;
  };
  isGlobalStyle: boolean;
  isSurface: boolean;
  isContainer: boolean;
  isAlignmentFix: boolean;
  isOriginalImageReference: boolean;
  referenceImageBase64?: string | null;
  referenceMaterialDescription?: string | null;
  sceneInventory: string;
}

export const buildEditingPrompt = (params: EditingPromptParams): string => {
  const {
    objectDescription,
    sourceCoords,
    translation,
    identifiedObject,
    targetObject,
    isGlobalStyle,
    isSurface,
    isContainer,
    isAlignmentFix,
    isOriginalImageReference,
    referenceImageBase64,
    referenceMaterialDescription,
    sceneInventory,
  } = params;

  // Build action based on operation type
  let action: string;
  switch (translation.operation_type) {
    case 'STYLE':
      action = buildStyleAction({
        objectDescription,
        proposedAction: translation.proposed_action,
        isGlobalStyle,
      });
      break;
    case 'INTERNAL_MODIFY':
      action = buildInternalModifyAction({
        objectDescription,
        proposedAction: translation.proposed_action,
      });
      break;
    case 'REMOVE':
      action = buildRemoveAction({
        objectDescription,
        isSurface,
        isContainer,
      });
      break;
    case 'MOVE':
      const destCoords = targetObject?.position || translation.proposed_action;
      action = buildMoveAction({
        objectDescription,
        sourceCoords,
        destCoords,
      });
      break;
    default:
      action = isAlignmentFix
        ? buildAlignmentAction({
            objectDescription,
            proposedAction: translation.proposed_action,
            sourceCoords,
          })
        : buildDefaultAction({
            objectDescription,
            proposedAction: translation.proposed_action,
          });
      break;
  }

  // Build reference guidance
  let referenceGuidance = '';
  if (referenceImageBase64 || referenceMaterialDescription) {
    // If this is the original image reference (for quality matching)
    if (isOriginalImageReference && referenceImageBase64) {
      referenceGuidance = QUALITY_REFERENCE;
    } else if (referenceMaterialDescription || referenceImageBase64) {
      // Strong reference style application - positive framing
      if (isGlobalStyle && referenceImageBase64) {
        // Room-wide redesign with reference - STRONG application
        const styleDetails = referenceMaterialDescription 
          ? `\n\nREFERENCE ANALYSIS DETAILS:\n${referenceMaterialDescription}\n\nUse these EXACT specifications from the reference analysis.`
          : '';
        
        referenceGuidance = `\n\nREFERENCE STYLE APPLICATION (CRITICAL - FOLLOW EXACTLY):

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
      } else if (referenceImageBase64) {
        // Object-specific style with reference - STRONG application
        const styleDetails = referenceMaterialDescription 
          ? `\n\nREFERENCE ANALYSIS DETAILS:\n${referenceMaterialDescription}\n\nUse these EXACT specifications from the reference analysis.`
          : '';
        
        referenceGuidance = `\n\nREFERENCE STYLE APPLICATION (CRITICAL - FOLLOW EXACTLY):

The FIRST image is your style reference. You MUST apply its EXACT style to the target object:
${styleDetails}
- Match the EXACT materials, colors, textures, and finishes from the reference
- Match the EXACT shape and design details from the reference if appropriate
- Make the transformation clearly visible and match the reference precisely

The SECOND image is the current image. Transform the target object to match the reference style EXACTLY.
Keep the object in its current position and maintain room structure.`;
      } else if (referenceMaterialDescription) {
        // Text-based style description - use EXACT details
        referenceGuidance = `\n\nSTYLE APPLICATION (USE EXACT DETAILS):

Apply this EXACT style: ${referenceMaterialDescription}

You MUST use the EXACT materials, colors, textures, and finishes specified in the style description above.
Do not generalize or approximate - match the specifications precisely.`;
      }
    }
  }

  const context = `Target: ${objectDescription} at ${sourceCoords}.`;

  // Assemble prompt sections
  const sections = [
    GROUNDING,
    DIMENSION_CONSTRAINT,
    sceneInventory,
    context,
    action,
    referenceGuidance,
    PRESERVATION_BASIC,
  ].filter(s => s && s.trim());

  return sections.join('\n\n');
};

