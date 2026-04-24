const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export async function identifyProductImage(file: File): Promise<{ name: string; category: string }> {
  const mediaType = (file.type || 'image/jpeg') as string;
  const imageBase64 = await fileToBase64(file);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mediaType }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AI Vision failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { name: data.name, category: data.category };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
