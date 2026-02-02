/**
 * Default/general editing prompts
 */

export interface DefaultEditPromptParams {
  objectDescription: string;
  proposedAction: string;
}

export const buildDefaultAction = (params: DefaultEditPromptParams): string => {
  const { objectDescription, proposedAction } = params;
  
  return `Edit the ${objectDescription}: ${proposedAction}

Apply this change to the target object only.
Keep surrounding areas unchanged.`;
};

