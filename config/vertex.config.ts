/**
 * Configuration for Vertex AI Imagen services.
 */
export interface VertexConfig {
  projectId: string;
  location: string;
  models: {
    IMAGEN_EDIT: string;
  };
  endpoints: {
    predict: (projectId: string, location: string, model: string) => string;
  };
  defaults: {
    guidanceScale: number;
    sampleCount: number;
    stepsInsert: number;
    stepsRemove: number;
    maskDilation: number;
  };
  safety: {
    safetySetting: string;
    personGeneration: string;
  };
}

export const VERTEX_CONFIG: VertexConfig = {
  projectId: process.env.VERTEX_PROJECT_ID || '',
  location: process.env.VERTEX_LOCATION || 'us-central1',
  models: {
    // Imagen 3 for editing/inpainting
    IMAGEN_EDIT: 'imagen-3.0-capability-001',
  },
  endpoints: {
    predict: (projectId: string, location: string, model: string) =>
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`,
  },
  defaults: {
    guidanceScale: 60,      // 0-500, higher = more prompt adherence
    sampleCount: 1,         // 1-4 images to generate
    stepsInsert: 35,        // 16-75, more steps = higher quality
    stepsRemove: 12,        // Lower steps for removal (faster)
    maskDilation: 0.02,     // 2% dilation around mask edges
  },
  safety: {
    safetySetting: 'block_low_and_above',
    personGeneration: 'allow_adult',
  },
};

/**
 * Check if Vertex AI is properly configured.
 */
export const isVertexConfigured = (): boolean => {
  return !!(VERTEX_CONFIG.projectId && VERTEX_CONFIG.location);
};

/**
 * Get the Imagen edit endpoint URL.
 */
export const getImagenEditEndpoint = (): string => {
  const { projectId, location, models, endpoints } = VERTEX_CONFIG;
  return endpoints.predict(projectId, location, models.IMAGEN_EDIT);
};

