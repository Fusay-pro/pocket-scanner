import { supabase } from '../lib/supabase';

const BUCKET = 'product-images';

export async function uploadProductImage(
  storeId: string,
  productId: string,
  base64: string,
): Promise<string> {
  const byteString = atob(base64.split(',')[1] ?? base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const path = `${storeId}/${productId}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteProductImage(
  storeId: string,
  productId: string,
): Promise<void> {
  await supabase.storage.from(BUCKET).remove([`${storeId}/${productId}.jpg`]);
}
