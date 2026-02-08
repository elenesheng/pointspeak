/**
 * Mask generation utilities for creating binary masks from bounding boxes.
 * Supports single objects, multiple objects, and position-based masks for move operations.
 */
const DEFAULT_MASK_DILATION = 0.02;

/**
 * Pixel coordinates derived from normalized box_2d.
 */
export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts normalized 0-1000 bounding box to pixel coordinates.
 * box_2d format: [ymin, xmin, ymax, xmax]
 */
export const boxToPixels = (
  box_2d: [number, number, number, number],
  imageWidth: number,
  imageHeight: number
): PixelBox => {
  const [ymin, xmin, ymax, xmax] = box_2d;
  return {
    x: Math.round((xmin / 1000) * imageWidth),
    y: Math.round((ymin / 1000) * imageHeight),
    width: Math.round(((xmax - xmin) / 1000) * imageWidth),
    height: Math.round(((ymax - ymin) / 1000) * imageHeight),
  };
};

/**
 * Applies dilation to a pixel box (expands the region).
 */
export const dilatePixelBox = (
  box: PixelBox,
  imageWidth: number,
  imageHeight: number,
  dilationPercent: number = DEFAULT_MASK_DILATION
): PixelBox => {
  const dilatePixels = Math.round(Math.max(imageWidth, imageHeight) * dilationPercent);

  return {
    x: Math.max(0, box.x - dilatePixels),
    y: Math.max(0, box.y - dilatePixels),
    width: Math.min(imageWidth - Math.max(0, box.x - dilatePixels), box.width + 2 * dilatePixels),
    height: Math.min(imageHeight - Math.max(0, box.y - dilatePixels), box.height + 2 * dilatePixels),
  };
};

/**
 * Generates a binary mask image from a bounding box.
 * White (255,255,255) = area to edit
 * Black (0,0,0) = area to preserve
 *
 * @param baseImageBase64 - Base64 encoded image (to get dimensions)
 * @param box_2d - Normalized bounding box [ymin, xmin, ymax, xmax] in 0-1000 scale
 * @param dilationPercent - Percentage to expand mask edges (default from config)
 * @returns Base64 encoded PNG mask (without data URL prefix)
 */
export const generateMaskFromBoundingBox = async (
  baseImageBase64: string,
  box_2d: [number, number, number, number],
  dilationPercent: number = DEFAULT_MASK_DILATION
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const width = img.width;
        const height = img.height;

        // Convert normalized coords to pixels
        let pixelBox = boxToPixels(box_2d, width, height);

        // Apply dilation
        pixelBox = dilatePixelBox(pixelBox, width, height, dilationPercent);

        // Create mask canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Fill entire canvas black (preserve region)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Draw white rectangle at object location (edit region)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(pixelBox.x, pixelBox.y, pixelBox.width, pixelBox.height);

        // Export as PNG base64 (without data URL prefix)
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl.split(',')[1]);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for mask generation'));

    // Handle both data URLs and raw base64
    const normalizedBase64 = baseImageBase64.includes(',')
      ? baseImageBase64
      : `data:image/png;base64,${baseImageBase64}`;
    img.src = normalizedBase64;
  });
};

/**
 * Generates a combined mask for multiple bounding boxes (e.g., for SWAP operations).
 * All specified regions will be white (edit), rest is black (preserve).
 */
export const generateCombinedMask = async (
  baseImageBase64: string,
  boxes: [number, number, number, number][],
  dilationPercent: number = DEFAULT_MASK_DILATION
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const width = img.width;
        const height = img.height;

        // Create mask canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Fill entire canvas black (preserve region)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Draw white rectangles for each box
        ctx.fillStyle = '#FFFFFF';
        for (const box_2d of boxes) {
          let pixelBox = boxToPixels(box_2d, width, height);
          pixelBox = dilatePixelBox(pixelBox, width, height, dilationPercent);
          ctx.fillRect(pixelBox.x, pixelBox.y, pixelBox.width, pixelBox.height);
        }

        // Export as PNG base64
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl.split(',')[1]);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for mask generation'));

    const normalizedBase64 = baseImageBase64.includes(',')
      ? baseImageBase64
      : `data:image/png;base64,${baseImageBase64}`;
    img.src = normalizedBase64;
  });
};

/**
 * Generates a mask at a specific target position (for MOVE operations).
 * Creates a mask at the target location with the same dimensions as the source box.
 * Handles aspect-ratio-aware coordinate mapping to ensure accurate positioning.
 */
export const generateMaskAtPosition = async (
  baseImageBase64: string,
  sourceBox: [number, number, number, number],
  targetPosition: { x: number; y: number }, // Normalized 0-1000 coordinates
  dilationPercent: number = DEFAULT_MASK_DILATION
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const imageWidth = img.width;
        const imageHeight = img.height;
        const aspectRatio = imageWidth / imageHeight;

        // Calculate source box dimensions in normalized space (0-1000)
        const [ymin, xmin, ymax, xmax] = sourceBox;
        const boxWidth = xmax - xmin;  // Normalized width (0-1000)
        const boxHeight = ymax - ymin; // Normalized height (0-1000)

        // Convert normalized target position to pixel coordinates
        const targetXPixels = (targetPosition.x / 1000) * imageWidth;
        const targetYPixels = (targetPosition.y / 1000) * imageHeight;

        // Convert normalized box dimensions to pixel dimensions
        const boxWidthPixels = (boxWidth / 1000) * imageWidth;
        const boxHeightPixels = (boxHeight / 1000) * imageHeight;

        // Create target box centered at target position (in pixels)
        const targetXMin = Math.max(0, targetXPixels - boxWidthPixels / 2);
        const targetYMin = Math.max(0, targetYPixels - boxHeightPixels / 2);
        const targetXMax = Math.min(imageWidth, targetXPixels + boxWidthPixels / 2);
        const targetYMax = Math.min(imageHeight, targetYPixels + boxHeightPixels / 2);

        // Convert back to normalized coordinates (0-1000) for generateMaskFromBoundingBox
        const targetBox: [number, number, number, number] = [
          (targetYMin / imageHeight) * 1000, // ymin
          (targetXMin / imageWidth) * 1000,  // xmin
          (targetYMax / imageHeight) * 1000, // ymax
          (targetXMax / imageWidth) * 1000,  // xmax
        ];

        // Ensure box is within bounds
        const normalizedBox: [number, number, number, number] = [
          Math.max(0, Math.min(1000, targetBox[0])),
          Math.max(0, Math.min(1000, targetBox[1])),
          Math.max(0, Math.min(1000, targetBox[2])),
          Math.max(0, Math.min(1000, targetBox[3])),
        ];

        // Use existing mask generation with normalized coordinates
        generateMaskFromBoundingBox(baseImageBase64, normalizedBox, dilationPercent)
          .then(resolve)
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for mask generation'));

    const normalizedBase64 = baseImageBase64.includes(',')
      ? baseImageBase64
      : `data:image/png;base64,${baseImageBase64}`;
    img.src = normalizedBase64;
  });
};

