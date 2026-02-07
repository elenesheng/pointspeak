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
import { DIMENSION_CONSTRAINT, GROUNDING, PRESERVATION_BASIC, SPATIAL_AWARENESS_CONSTRAINTS, LAYOUT_PRESERVATION_CRITICAL, ROOM_IDENTITY_LOCK, PROHIBITED_BEHAVIOR, CAMERA_LOCK_RULE } from '../templates/base';
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
  isFurniture?: boolean;
  isSurface: boolean;
  isContainer: boolean;
  isAlignmentFix: boolean;
  isOriginalImageReference: boolean;
  referenceImageBase64?: string | null;
  referenceMaterialDescription?: string | null;
  sceneInventory: string;
  stylePlan?: any; // GlobalStylePlan from reasoning analysis
}

export const buildEditingPrompt = (params: EditingPromptParams): string => {
  const {
    objectDescription,
    sourceCoords,
    translation,
    identifiedObject,
    targetObject,
    isGlobalStyle,
    isFurniture,
    isSurface,
    isContainer,
    isAlignmentFix,
    isOriginalImageReference,
    referenceImageBase64,
    referenceMaterialDescription,
    sceneInventory,
    stylePlan,
  } = params;

  // Build action based on operation type
  let action: string;
  switch (translation.operation_type) {
    case 'STYLE':
      action = buildStyleAction({
        objectDescription,
        proposedAction: translation.proposed_action,
        isGlobalStyle,
        isFurniture,
        isSurface,
        hasReferenceImage: !!referenceImageBase64 && !isOriginalImageReference,
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
        // Room-wide redesign with reference - use centralized fragment with reasoning plan
        referenceGuidance = REFERENCE_GUIDANCE_GLOBAL(referenceMaterialDescription, stylePlan);
      } else if (referenceImageBase64) {
        // Object-specific style with reference - use centralized fragment with furniture detection
        referenceGuidance = REFERENCE_GUIDANCE_OBJECT(referenceMaterialDescription, isFurniture);
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
  // For global style: Use minimal, non-conflicting constraints
  // For object-specific: Use full constraint set
  const sections: string[] = [];
  
  if (isGlobalStyle && referenceImageBase64) {
    // Global style: Camera lock FIRST, then style instructions
    sections.push(
      GROUNDING,
      CAMERA_LOCK_RULE, // CRITICAL: Lock camera BEFORE style instructions
      ROOM_IDENTITY_LOCK, // Single unified constraint block
      sceneInventory,
      context,
      action,
      referenceGuidance,
      PROHIBITED_BEHAVIOR,
      SPATIAL_AWARENESS_CONSTRAINTS
    );
  } else {
    // Object-specific: Full constraint set
    sections.push(
      GROUNDING,
      DIMENSION_CONSTRAINT,
      sceneInventory,
      context,
      action,
      referenceGuidance,
      PRESERVATION_BASIC,
      isGlobalStyle ? SPATIAL_AWARENESS_CONSTRAINTS : ''
    );
  }

  return sections.filter(s => s && s.trim()).join('\n\n');

  return sections.join('\n\n');
};

