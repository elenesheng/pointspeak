/**
 * Remove/delete editing prompts
 */

export interface RemovePromptParams {
  objectDescription: string;
  isSurface: boolean;
  isContainer: boolean;
  isFurniture?: boolean;
}

export const buildRemoveAction = (params: RemovePromptParams): string => {
  const { objectDescription, isSurface, isContainer, isFurniture } = params;

  // Furniture items (tables, desks, chairs) should always be DELETED, not "cleared"
  // Even if they also match surface patterns
  if (isSurface && !isFurniture && !isContainer) {
    return `Clear all items from the ${objectDescription} surface.

Task: Remove everything sitting on this surface.
Then: Restore the clean surface texture naturally.
Result: Empty, clean ${objectDescription} with visible continuous surface.
Do NOT change image dimensions, camera angle, or any other objects.`;
  }

  if (isContainer && !isFurniture) {
    return `Empty the ${objectDescription} contents.

Task: Remove all items inside or on the ${objectDescription}.
Keep: The ${objectDescription} structure itself intact.
Result: Empty, clean ${objectDescription} ready for new use.
Do NOT change image dimensions, camera angle, or any other objects.`;
  }

  return `Delete the ${objectDescription} from the image completely.

Task: Remove this object entirely from the scene.
Then: Fill the empty space with natural background continuation that matches surrounding textures, lighting, and shadows.
Maintain: Same light direction, shadow patterns, and camera angle as the original scene.
Result: Scene looks like the object was never there, with consistent lighting and seamless background throughout.
Do NOT change image dimensions, crop, or zoom. Output must have EXACTLY the same pixel dimensions as input.`;
};

