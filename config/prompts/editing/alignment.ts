/**
 * Alignment editing prompts
 */

export interface AlignmentPromptParams {
  objectDescription: string;
  proposedAction: string;
  sourceCoords: string;
}

export const buildAlignmentAction = (params: AlignmentPromptParams): string => {
  const { objectDescription, proposedAction, sourceCoords } = params;
  
  return `Fix alignment of the ${objectDescription}.

Task: ${proposedAction}
Method: Add panels, trim, or filler to align with neighbors.
Keep: The ${objectDescription} stays at ${sourceCoords} - do not relocate it.
Result: Clean alignment with adjacent elements.`;
};

