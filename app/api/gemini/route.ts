import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Allow large request bodies for base64 images
export const maxDuration = 120; // 2 minutes for image generation

const MAX_BODY_SIZE = 50 * 1024 * 1024; // 50MB for large images

function getServerApiKey(): string {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }
  return key;
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    const body = await request.json();
    const { model, contents, config } = body;

    if (!model || !contents) {
      return NextResponse.json({ error: 'Missing model or contents' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: getServerApiKey() });

    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });

    // Return the full response structure that clients expect
    return NextResponse.json({
      text: response.text,
      candidates: response.candidates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('403') || message.includes('401') ? 401
      : message.includes('429') || message.includes('RESOURCE_EXHAUSTED') ? 429
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
