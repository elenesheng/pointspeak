import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

const VERTEX_CONFIG = {
  projectId: process.env.VERTEX_PROJECT_ID || 'gen-lang-client-0625402097',
  location: process.env.VERTEX_LOCATION || 'us-central1',
  model: 'imagen-3.0-capability-001',
};

export async function POST(request: NextRequest) {
  try {
    // Get the session to retrieve the access token
    const session = await getServerSession(authOptions);
    
    if (!session?.accessToken) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated', needsAuth: true },
        { status: 401 }
      );
    }

    if (session.error === 'RefreshAccessTokenError') {
      return NextResponse.json(
        { success: false, error: 'Token refresh failed. Please sign in again.', needsAuth: true },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { baseImage, mask, prompt, editMode, guidanceScale, steps } = body;

    if (!baseImage || !mask) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: baseImage, mask' },
        { status: 400 }
      );
    }

    const endpoint = `https://${VERTEX_CONFIG.location}-aiplatform.googleapis.com/v1/projects/${VERTEX_CONFIG.projectId}/locations/${VERTEX_CONFIG.location}/publishers/google/models/${VERTEX_CONFIG.model}:predict`;

    const payload = {
      instances: [{
        prompt: prompt || '',
        referenceImages: [
          {
            referenceType: 'REFERENCE_TYPE_RAW',
            referenceId: 1,
            referenceImage: { bytesBase64Encoded: baseImage },
          },
          {
            referenceType: 'REFERENCE_TYPE_MASK',
            referenceId: 2,
            referenceImage: { bytesBase64Encoded: mask },
            maskImageConfig: {
              maskMode: 'MASK_MODE_USER_PROVIDED',
              dilation: 0.02,
            },
          },
        ],
      }],
      parameters: {
        sampleCount: 1,
        editMode: editMode || 'EDIT_MODE_INPAINT_INSERTION',
        baseSteps: steps || (editMode === 'EDIT_MODE_INPAINT_REMOVAL' ? 12 : 35),
        guidanceScale: guidanceScale || 60,
        safetySetting: 'block_low_and_above',
        personGeneration: 'allow_adult',
      },
    };

    console.log(`[Imagen API] ${editMode} request to Vertex AI`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Imagen API] Error:', errorText);
      
      const needsAuth = response.status === 401 || response.status === 403;
      return NextResponse.json(
        { success: false, error: errorText, needsAuth },
        { status: response.status }
      );
    }

    const result = await response.json();
    const images: string[] = [];

    if (result.predictions) {
      for (const prediction of result.predictions) {
        if (prediction.bytesBase64Encoded) {
          images.push(prediction.bytesBase64Encoded);
        }
      }
    }

    if (images.length === 0) {
      const reason = result.predictions?.[0]?.raiFilteredReason;
      return NextResponse.json({
        success: false,
        error: reason ? `Blocked by safety filter: ${reason}` : 'No images generated',
      });
    }

    console.log(`[Imagen API] ✓ Generated ${images.length} image(s)`);
    return NextResponse.json({ success: true, images });

  } catch (error) {
    console.error('[Imagen API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
