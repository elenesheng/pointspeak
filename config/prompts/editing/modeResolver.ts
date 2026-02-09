/**
 * Edit mode resolver - single source of truth for determining edit mode
 * Never infer mode inside prompts - always use this resolver
 */

import { IdentifiedObject } from '../../../types/spatial.types';
import { IntentTranslation } from '../../../types/ai.types';
import { EditMode } from '../../../config/modelConfigs';

const GLOBAL_CONTEXT_ID = 'global_room_context';
const GLOBAL_STYLE_KEYWORDS = /room|whole|entire|global|all|redesign/i;

export interface ResolveEditModeParams {
  identifiedObject: IdentifiedObject;
  translation: IntentTranslation;
  hasReferenceImage: boolean;
  isFurniture: boolean;
  isSurface: boolean;
}

/**
 * Resolve edit mode from context
 * This is the single source of truth - never infer mode elsewhere
 * 
 * CRITICAL: Priority order matters - SURFACE/OBJECT must beat GLOBAL_STYLE
 * to prevent global rules from leaking into specific replacements
 */
export function resolveEditMode(params: ResolveEditModeParams): EditMode {
  const { identifiedObject, translation, hasReferenceImage, isFurniture, isSurface } = params;

  // CRITICAL: Furniture must be checked BEFORE surface because some items
  // (like "table", "desk") can match both patterns. Furniture is more specific.

  // Object replacement mode (furniture, lamps, etc.) - checked FIRST
  if (hasReferenceImage && isFurniture) {
    return 'OBJECT_REPLACEMENT';
  }

  // Surface replacement mode (floors, walls, countertops)
  if (hasReferenceImage && isSurface) {
    return 'SURFACE_REPLACEMENT';
  }

  // Global style mode - only if no specific object/surface replacement
  // Must check explicit keywords, not just fallback object
  if (
    GLOBAL_STYLE_KEYWORDS.test(translation.proposed_action) ||
    (identifiedObject.id === GLOBAL_CONTEXT_ID && !hasReferenceImage)
  ) {
    return 'GLOBAL_STYLE';
  }

  // Default: minor edit mode
  return 'MINOR_EDIT';
}

