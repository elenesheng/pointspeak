/**
 * Remove/delete editing prompts
 */

export interface RemovePromptParams {
  objectDescription: string;
  isSurface: boolean;
  isContainer: boolean;
}

export const buildRemoveAction = (params: RemovePromptParams): string => {
  const { objectDescription, isSurface, isContainer } = params;
  
  if (isSurface) {
    return `Clear all items from the ${objectDescription} surface.

Task: Remove everything sitting on this surface.
Then: Restore the clean surface texture naturally.
Result: Empty, clean ${objectDescription} with visible continuous surface.`;
  }

  if (isContainer) {
    return `Empty the ${objectDescription} contents.

Task: Remove all items inside or on the ${objectDescription}.
Keep: The ${objectDescription} structure itself intact.
Result: Empty, clean ${objectDescription} ready for new use.`;
  }

  return `Delete the ${objectDescription} from the image.

Task: Remove this object completely.
Then: Fill the empty space with natural background continuation that matches surrounding lighting and shadows.
Maintain: Same light direction and shadow patterns as the original scene.
Result: Scene looks like the object was never there, with consistent lighting throughout.`;
};

