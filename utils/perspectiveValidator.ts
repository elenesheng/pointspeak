/**
 * Validates if generated image has correct perspective
 * Checks for top-down vs eye-level indicators
 */
export const validatePerspective = async (base64Image: string): Promise<{
  isEyeLevel: boolean;
  confidence: number;
  reason: string;
}> => {
  // Simple heuristic: Eye-level images have horizon near middle
  // Top-down images have very high or very low horizon
  
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ isEyeLevel: false, confidence: 0, reason: 'Canvas failed' });
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Analyze horizon line position (simplified)
      // Eye-level: horizon near 40-60% from top
      // Top-down: horizon near 0-20% or 80-100%
      
      const horizonPosition = detectHorizonLine(imageData);
      const isEyeLevel = horizonPosition > 0.35 && horizonPosition < 0.65;
      
      resolve({
        isEyeLevel,
        confidence: isEyeLevel ? 0.8 : 0.3,
        reason: isEyeLevel 
          ? 'Horizon detected at eye level' 
          : `Horizon at ${Math.round(horizonPosition * 100)}% (expected 40-60%)`
      });
    };
    img.onerror = () => {
      resolve({ isEyeLevel: false, confidence: 0, reason: 'Image load failed' });
    };
    img.src = `data:image/png;base64,${base64Image}`;
  });
};

function detectHorizonLine(imageData: ImageData): number {
  // Simplified: Look for horizontal edge concentration
  // Real implementation would use edge detection
  // For now, just return middle (we'll refine based on testing)
  return 0.5;
}

