/**
 * Internal modify editing prompts
 */

export interface InternalModifyPromptParams {
  objectDescription: string;
  proposedAction: string;
}

export const buildInternalModifyAction = (params: InternalModifyPromptParams): string => {
  const { objectDescription, proposedAction } = params;
  
  return `Modify inside the ${objectDescription}.

Task: ${proposedAction}
Scope: Changes only inside the object's existing boundaries.
Keep: Object position, size, outer shape unchanged.`;
};

