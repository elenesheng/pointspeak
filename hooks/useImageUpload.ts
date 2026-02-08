import React, { useState, useCallback } from 'react';
import { convertToPNG, normalizeBase64 } from '../utils/imageProcessing';

/**
 * Handles image file upload and converts to PNG for lossless storage.
 */
export const useImageUpload = (onUploadStart?: () => void, onUploadComplete?: (base64: string) => void) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (onUploadStart) onUploadStart();

    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      setImageUrl(result);
      if (onUploadComplete) {
        const pureBase64 = normalizeBase64(result);
        const pngBase64 = await convertToPNG(pureBase64);
        onUploadComplete(pngBase64);
      }
    };
    reader.readAsDataURL(file);
  }, [onUploadStart, onUploadComplete]);

  const clearImage = useCallback(() => setImageUrl(null), []);

  return { imageUrl, handleFileUpload, clearImage, setImageUrl };
};