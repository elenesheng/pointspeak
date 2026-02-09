/**
 * Image similarity detection for reference-return guard
 * Compares downscaled images to detect if output matches reference too closely
 */

/**
 * Calculate similarity score between two base64 images
 * Returns 0-1 where 1 = identical, 0 = totally different
 * Uses downscaled 32x32 grayscale comparison for speed
 */
export async function similarityScore(b64a: string, b64b: string): Promise<number> {
  const imgData = async (b64: string): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, 32, 32);
        resolve(ctx.getImageData(0, 0, 32, 32));
      };
      img.onerror = reject;
      img.src = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
    });
  };

  try {
    const A = await imgData(b64a);
    const B = await imgData(b64b);

    let diff = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      // Grayscale comparison
      const ga = (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3;
      const gb = (B.data[i] + B.data[i + 1] + B.data[i + 2]) / 3;
      diff += Math.abs(ga - gb);
    }
    const maxDiff = 32 * 32 * 255;
    return 1 - diff / maxDiff;
  } catch (error) {
    return 0;
  }
}




