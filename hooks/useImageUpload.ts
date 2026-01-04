import React, { useState, useCallback } from 'react';

export const useImageUpload = (onUploadStart?: () => void, onUploadComplete?: (base64: string) => void) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (onUploadStart) onUploadStart();

    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      setImageUrl(result);
      if (onUploadComplete) {
        const pureBase64 = result.split(',')[1];
        onUploadComplete(pureBase64);
      }
    };
    reader.readAsDataURL(file);
  }, [onUploadStart, onUploadComplete]);

  const clearImage = useCallback(() => setImageUrl(null), []);

  return { imageUrl, handleFileUpload, clearImage, setImageUrl };
};