import { convertToPNG, normalizeBase64 } from '../../utils/imageProcessing';

export type ImagenEditMode = 'EDIT_MODE_INPAINT_INSERTION' | 'EDIT_MODE_INPAINT_REMOVAL';

export interface ImagenInpaintRequest {
  baseImage: string;
  mask: string;
  prompt: string;
  editMode: ImagenEditMode;
  sampleCount?: number;
  guidanceScale?: number;
  steps?: number;
}

export interface ImagenInpaintResponse {
  success: boolean;
  images: string[];
  error?: string;
  needsAuth?: boolean;
}

/**
 * Check if authenticated with Vertex AI via NextAuth
 */
export const checkImagenAuth = async (): Promise<{ authenticated: boolean }> => {
  try {
    const response = await fetch('/api/auth/session');
    const session = await response.json();
    
    return { 
      authenticated: !!session?.accessToken && session?.error !== 'RefreshAccessTokenError'
    };
  } catch (error) {
    console.error('[Imagen] Auth check failed:', error);
    return { authenticated: false };
  }
};

/**
 * Perform Imagen inpainting via the Next.js API route
 * Uses NextAuth session for automatic token management
 */
export const performImagenInpaint = async (
  request: ImagenInpaintRequest
): Promise<ImagenInpaintResponse> => {
  const { baseImage, mask, prompt, editMode, guidanceScale, steps } = request;

  console.log(`[Imagen] Sending ${editMode} request...`);

  try {
    const response = await fetch('/api/imagen/inpaint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseImage: normalizeBase64(baseImage),
        mask: normalizeBase64(mask),
        prompt: prompt || '',
        editMode,
        guidanceScale,
        steps,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      console.error('[Imagen] API error:', result.error);

      // Check for scope insufficient error - user needs to re-authenticate
      const errorStr = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
      const isScopeError = errorStr.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || 
                           errorStr.includes('insufficient authentication scopes');
      
      if (isScopeError) {
        console.error('[Imagen] ⚠️ Token has insufficient scopes. User needs to SIGN OUT and SIGN BACK IN to grant Vertex AI permissions.');
        return {
          success: false,
          images: [],
          error: 'Please SIGN OUT and SIGN BACK IN to grant Vertex AI permissions. Your current session was created before we added the required scopes.',
          needsAuth: true,
        };
      }

      // If auth is needed, redirect to sign in
      if (result.needsAuth) {
        console.log('[Imagen] Authentication required. Please sign in.');
      }

      return {
        success: false,
        images: [],
        error: result.error,
        needsAuth: result.needsAuth,
      };
    }

    // Convert images to PNG format
    const images: string[] = [];
    for (const img of result.images) {
      const pngBase64 = await convertToPNG(img);
      images.push(pngBase64);
    }

    console.log(`[Imagen] ✓ Received ${images.length} image(s)`);

    return {
      success: true,
      images,
    };
  } catch (error) {
    console.error('[Imagen] Error:', error);

    return {
      success: false,
      images: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export const removeWithImagen = async (
  baseImage: string,
  mask: string,
  prompt?: string
): Promise<ImagenInpaintResponse> => {
  return performImagenInpaint({
    baseImage,
    mask,
    prompt: prompt || '',
    editMode: 'EDIT_MODE_INPAINT_REMOVAL',
  });
};

export const insertWithImagen = async (
  baseImage: string,
  mask: string,
  prompt: string,
  guidanceScale?: number
): Promise<ImagenInpaintResponse> => {
  return performImagenInpaint({
    baseImage,
    mask,
    prompt,
    editMode: 'EDIT_MODE_INPAINT_INSERTION',
    guidanceScale: guidanceScale || 75,
  });
};
