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
import { resolveEditMode, ResolveEditModeParams } from './modeResolver';
import { BASE_PROMPTS } from './modePrompts';
import { EditMode } from '../../../config/modelConfigs';

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
  editMode?: EditMode; // Optional: if provided, use it; otherwise resolve
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
    editMode: providedEditMode,
  } = params;

  // Resolve edit mode (use provided or resolve from context)
  const editMode = providedEditMode || resolveEditMode({
    identifiedObject: identifiedObject as any,
    translation: translation as any,
    hasReferenceImage: !!referenceImageBase64 && !isOriginalImageReference,
    isFurniture: isFurniture || false,
    isSurface,
  });

  // Get mode-specific base prompt
  const basePrompt = BASE_PROMPTS[editMode];

  // Build action based on operation type
  // CRITICAL: When editMode is SURFACE_REPLACEMENT or OBJECT_REPLACEMENT,
  // always use buildStyleAction regardless of operation_type (EDIT/SWAP/STYLE all route here).
  // This prevents generic "Edit the floor: change material" prompts that don't work.
  const hasReferenceImage = !!referenceImageBase64 && !isOriginalImageReference;
  let action: string;

  if ((editMode === 'SURFACE_REPLACEMENT' || editMode === 'OBJECT_REPLACEMENT') &&
      translation.operation_type !== 'REMOVE' && translation.operation_type !== 'MOVE') {
    // For surface/object replacement modes, always use the style action builder
    // which has proper surface/furniture-specific prompts
    action = buildStyleAction({
      objectDescription,
      proposedAction: translation.proposed_action,
      isGlobalStyle,
      isFurniture,
      isSurface,
      hasReferenceImage,
    });
  } else {
    switch (translation.operation_type) {
      case 'STYLE':
        action = buildStyleAction({
          objectDescription,
          proposedAction: translation.proposed_action,
          isGlobalStyle,
          isFurniture,
          isSurface,
          hasReferenceImage,
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
          isFurniture,
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
  }

  // Build reference guidance
  let referenceGuidance = '';
  if (referenceImageBase64 || referenceMaterialDescription) {
    // If this is the original image reference (for quality matching)
    if (isOriginalImageReference && referenceImageBase64) {
      referenceGuidance = QUALITY_REFERENCE;
    } else if (referenceMaterialDescription || referenceImageBase64) {
      // Strong reference style application - positive framing
      if (isGlobalStyle) {
        // Room-wide redesign: text-only style plan (no reference image sent to generation)
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

  // Assemble prompt sections using mode-specific base
  const sections: string[] = [
    basePrompt, // Mode-specific base prompt (includes camera lock, grounding, etc.)
    sceneInventory,
    context,
    action,
    referenceGuidance,
  ];

  // Add mode-specific additional constraints
  if (editMode === 'GLOBAL_STYLE') {
    sections.push(
      ROOM_IDENTITY_LOCK,
      PROHIBITED_BEHAVIOR,
      SPATIAL_AWARENESS_CONSTRAINTS
    );
  } else if (editMode === 'OBJECT_REPLACEMENT' || editMode === 'SURFACE_REPLACEMENT') {
    // Minimal additional constraints for replacement modes
    // Base prompt already has camera lock and dimension constraint
  } else {
    // MINOR_EDIT mode
    sections.push(PRESERVATION_BASIC);
  }

  return sections.filter(s => s && s.trim()).join('\n\n');
};

