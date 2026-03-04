import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

function getServerApiKey(): string {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }
  return key;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, model, config, name } = body;

    const ai = new GoogleGenAI({ apiKey: getServerApiKey() });

    if (action === 'create') {
      const cacheResponse = await ai.caches.create({ model, config });
      return NextResponse.json({ name: cacheResponse.name });
    }

    if (action === 'delete') {
      await ai.caches.delete({ name });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
