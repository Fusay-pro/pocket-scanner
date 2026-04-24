const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export async function identifyProductFrames(
  frontBase64: string,
  backBase64: string | null,
): Promise<{ name: string; category: string }> {
  const images = [frontBase64];
  if (backBase64) images.push(backBase64);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AI Vision failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { name: data.name, category: data.category };
}

export function captureVideoFrame(): string | null {
  const video = document.querySelector('#qr-reader video') as HTMLVideoElement | null;
  if (!video || !video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
}
