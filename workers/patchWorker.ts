/* eslint-disable no-restricted-globals */

interface PatchRequest {
  id: string;
  originalBase64: string;
  aiResultBase64: string;
  maskBase64: string;
  outputType?: 'image/jpeg' | 'image/png';
  quality?: number;
}

type PatchResponse = { id: string; ok: true; blob: Blob } | { id: string; ok: false; error: string };

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
};

self.onmessage = async (evt: MessageEvent<PatchRequest>) => {
  const { id, originalBase64, aiResultBase64, maskBase64 } = evt.data;
  const outputType = evt.data.outputType ?? 'image/jpeg';
  const quality = evt.data.quality ?? 1.0;

  try {
    const [originalBmp, aiBmp, maskBmp] = await Promise.all([
      createImageBitmap(base64ToBlob(originalBase64, 'image/jpeg')),
      createImageBitmap(base64ToBlob(aiResultBase64, 'image/jpeg')),
      createImageBitmap(base64ToBlob(maskBase64, 'image/png')),
    ]);

    const canvas = new OffscreenCanvas(originalBmp.width, originalBmp.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');

    ctx.drawImage(originalBmp, 0, 0);

    const patchCanvas = new OffscreenCanvas(originalBmp.width, originalBmp.height);
    const pCtx = patchCanvas.getContext('2d');
    if (!pCtx) throw new Error('OffscreenCanvas patch 2D context unavailable');
    pCtx.drawImage(aiBmp, 0, 0, originalBmp.width, originalBmp.height);

    pCtx.globalCompositeOperation = 'destination-in';
    pCtx.drawImage(maskBmp, 0, 0, originalBmp.width, originalBmp.height);

    ctx.drawImage(patchCanvas, 0, 0);

    const blob = await canvas.convertToBlob(
      outputType === 'image/jpeg' ? { type: 'image/jpeg', quality } : { type: 'image/png' }
    );

    const res: PatchResponse = { id, ok: true, blob };
    (self as unknown as Worker).postMessage(res, [blob]);
  } catch (e) {
    const res: PatchResponse = {
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    (self as unknown as Worker).postMessage(res);
  }
};

