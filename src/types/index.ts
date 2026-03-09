export interface Store {
  id: string;
  name: string;
  location: string;
  createdAt: string;
}

export interface Product {
  id: string;
  storeId: string;
  barcode: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  addedAt: string;
  notes: string;
  minQty: number | null;
  costPrice: number | null;
  sellPrice: number | null;
}

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'none';

export function getExpiryStatus(expiryDate: string | null): ExpiryStatus {
  if (!expiryDate) return 'none';
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 7) return 'soon';
  return 'ok';
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No expiry';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
