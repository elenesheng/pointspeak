
// Shared Image Processing Utilities

const getPixelIndex = (x: number, y: number, width: number) => (y * width + x) * 4;

// EROSION: Shrinks white areas. Removes thin lines (text, furniture lines).
// Pixel is kept WHITE only if ALL neighbors are WHITE.
export const applyErosion = (data: Uint8ClampedArray, width: number, height: number) => {
  const output = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = getPixelIndex(x, y, width);
      // Check 3x3 kernel
      let allWhite = true;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          if (data[getPixelIndex(x + kx, y + ky, width)] === 0) {
            allWhite = false;
            break;
          }
        }
        if (!allWhite) break;
      }
      const val = allWhite ? 255 : 0;
      output[idx] = output[idx + 1] = output[idx + 2] = val;
      output[idx + 3] = 255;
    }
  }
  return output;
};

// DILATION: Expands white areas. Restores wall thickness after erosion.
// Pixel becomes WHITE if ANY neighbor is WHITE.
export const applyDilation = (data: Uint8ClampedArray, width: number, height: number) => {
  const output = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = getPixelIndex(x, y, width);
      let anyWhite = false;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          if (data[getPixelIndex(x + kx, y + ky, width)] === 255) {
            anyWhite = true;
            break;
          }
        }
        if (anyWhite) break;
      }
      const val = anyWhite ? 255 : 0;
      output[idx] = output[idx + 1] = output[idx + 2] = val;
      output[idx + 3] = 255;
    }
  }
  return output;
};

// Robust Mask Generation Pipeline
export const generateBinaryMask = async (imageSrc: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        ctx.drawImage(img, 0, 0);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;

        // 1. Thresholding (Invert: Dark walls become White, Light background becomes Black)
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          // Threshold logic: If dark (<128), it's structure -> Make White. Else Black.
          const val = brightness < 150 ? 255 : 0; 
          data[i] = data[i + 1] = data[i + 2] = val;
          data[i + 3] = 255;
        }

        // 2. Morphological Opening (Erode -> Dilate)
        // This removes thin noise (text) but keeps thick blocks (walls)
        let processedData = applyErosion(data, canvas.width, canvas.height); // Remove text
        processedData = applyDilation(processedData, canvas.width, canvas.height); // Restore walls
        processedData = applyDilation(processedData, canvas.width, canvas.height); // Thicken slightly for safety

        imageData.data.set(processedData);
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = imageSrc;
  });
};

// Quality Preservation Utilities
// Store images as PNG (lossless) internally, convert to JPEG only for API

/**
 * Converts any image format to PNG (lossless) for internal storage
 * This prevents quality degradation from repeated JPEG compression
 */
export const convertToPNG = async (base64: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      // Extract base64 without data URL prefix
      const pngDataUrl = canvas.toDataURL('image/png');
      resolve(pngDataUrl.split(',')[1]);
    };
    img.onerror = reject;
    // Handle both data URLs and raw base64
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });
};

/**
 * Converts PNG to JPEG for API calls (if needed)
 * Uses high quality (0.95) to minimize compression artifacts
 */
export const convertToJPEG = async (base64: string, quality: number = 0.95): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      // Extract base64 without data URL prefix
      const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(jpegDataUrl.split(',')[1]);
    };
    img.onerror = reject;
    // Handle both data URLs and raw base64
    img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  });
};

/**
 * Normalizes image format - ensures we have clean base64 without data URL prefix
 */
export const normalizeBase64 = (base64: string): string => {
  if (base64.includes(',')) {
    return base64.split(',')[1];
  }
  return base64;
};

// Crop Image Utility (now returns PNG for quality preservation)
export const cropBase64Image = async (base64: string, box_2d: [number, number, number, number]): Promise<string> => {
  return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
          const canvas = document.createElement('canvas');
          // box_2d is [ymin, xmin, ymax, xmax] in 0-1000 scale
          const [ymin, xmin, ymax, xmax] = box_2d;
          
          const x = (xmin / 1000) * img.width;
          const y = (ymin / 1000) * img.height;
          const w = ((xmax - xmin) / 1000) * img.width;
          const h = ((ymax - ymin) / 1000) * img.height;
          
          canvas.width = w;
          canvas.height = h;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas context failed')); return; }
          
          ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
          // Return PNG for quality preservation
          resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = reject;
      // Handle both PNG and JPEG input
      const normalizedBase64 = normalizeBase64(base64);
      img.src = `data:image/png;base64,${normalizedBase64}`;
  });
};
