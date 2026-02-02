import { IdentifiedObject } from './spatial.types';

export type OperationType = 'REMOVE' | 'MOVE' | 'EDIT' | 'SWAP' | 'STYLE' | 'INTERNAL_MODIFY';

export interface IntentTranslation {
  operation_type: OperationType;
  interpreted_intent: string;
  proposed_action: string;
  spatial_check_required: boolean;
  new_position?: { description: string };
  removed_object_replacement?: string;
  imagen_prompt: string;
  source_visual_context?: string;
  target_visual_context?: string;
  validation?: {
    valid: boolean;
    warnings: string[];
    alternative_suggestion?: string;
  };
  conversational_response?: string;
  active_subject_name?: string;
}

export interface SpatialValidation {
  valid: boolean;
  warnings: string[];
  alternative_suggestion?: string;
  canForce?: boolean;
  forceAction?: IntentTranslation;
  forceObject?: IdentifiedObject;
}

export interface DesignSuggestion {
  id: string;
  title: string;
  description: string;
  action_type: OperationType;
  target_object_name: string;
  suggested_prompt: string;
  icon_hint: 'color' | 'layout' | 'style' | 'remove';
  confidence: number;
}
