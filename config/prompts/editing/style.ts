/**
 * Style editing prompts
 */

export interface StylePromptParams {
  objectDescription: string;
  proposedAction: string;
  isGlobalStyle: boolean;
}

export const buildStyleAction = (params: StylePromptParams): string => {
  const { objectDescription, proposedAction, isGlobalStyle } = params;
  
  if (isGlobalStyle) {
    return `Redesign this room to match the reference style.

Apply the reference style throughout: materials, colors, textures, furniture styles, and decorative elements.
Match furniture shapes and arrangements from the reference where they fit the current room layout.
Keep the existing room structure: wall positions, door locations, window positions, and plumbing fixtures remain unchanged.`;
  }
  
  return `Change the ${objectDescription} appearance to ${proposedAction} style.

Update materials, finishes, colors, and design details.
Keep the same position, size, and shape.`;
};

