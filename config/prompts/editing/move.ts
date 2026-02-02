/**
 * Move/relocate editing prompts
 */

export interface MovePromptParams {
  objectDescription: string;
  sourceCoords: string;
  destCoords: string;
}

export const buildMoveAction = (params: MovePromptParams): string => {
  const { objectDescription, sourceCoords, destCoords } = params;
  
  return `Move the ${objectDescription} to a new location.

CRITICAL: The ${objectDescription} must appear in ONLY ONE place - the destination.

Step 1: REMOVE the ${objectDescription} completely from ${sourceCoords}. 
        Fill that empty space with wall/floor/background matching original lighting and shadows.
Step 2: Place the SAME ${objectDescription} at ${destCoords} with shadows and lighting that match the destination area's existing light conditions.

Lighting: Maintain the same overall room lighting. New shadows must match the light direction already present in the scene.
The original location at ${sourceCoords} must show ONLY background after this edit.
There must be exactly ONE ${objectDescription} in the final image, at the new location.

Result: ONE ${objectDescription} at new location with consistent lighting. Original spot filled with matching background.`;
};

