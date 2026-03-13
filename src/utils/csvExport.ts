import type { Product } from '../types';
import type { Sale } from './storage';
import type { Store } from '../types';

function escapeCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(rows: string[][]): string {
  return rows.map(row => row.map(escapeCell).join(',')).join('\n');
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function exportInventoryCsv(stores: Store[], products: Product[]) {
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s.name]));
  const rows: string[][] = [[
    'Store', 'Product Name', 'Barcode', 'Category', 'Supplier',
    'Quantity', 'Unit', 'Expiry Date', 'Cost Price', 'Sell Price',
    'Min Qty', 'Added At',
  ]];
  const sorted = [...products].sort((a, b) => {
    const storeA = storeMap[a.storeId] ?? '';
    const storeB = storeMap[b.storeId] ?? '';
    if (storeA !== storeB) return storeA.localeCompare(storeB);
    return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
  });
  for (const p of sorted) {
    rows.push([
      storeMap[p.storeId] ?? p.storeId,
      p.name, p.barcode, p.category,
      p.supplier ?? '',
      String(p.quantity), p.unit,
      p.expiryDate ?? '',
      p.costPrice != null ? String(p.costPrice) : '',
      p.sellPrice != null ? String(p.sellPrice) : '',
      p.minQty != null ? String(p.minQty) : '',
      p.addedAt,
    ]);
  }
  triggerDownload(buildCsv(rows), `inventory-${new Date().toISOString().slice(0,10)}.csv`);
}

export function exportSalesCsv(stores: Store[], sales: Sale[]) {
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s.name]));
  const rows: string[][] = [[
    'Store', 'Product Name', 'Barcode', 'Category',
    'Quantity Sold', 'Sell Price', 'Revenue', 'Sold At',
  ]];
  const sorted = [...sales].sort((a, b) => {
    const storeA = storeMap[a.storeId] ?? '';
    const storeB = storeMap[b.storeId] ?? '';
    if (storeA !== storeB) return storeA.localeCompare(storeB);
    return new Date(a.soldAt).getTime() - new Date(b.soldAt).getTime();
  });
  for (const s of sorted) {
    rows.push([
      storeMap[s.storeId] ?? s.storeId,
      s.productName, s.barcode, s.category,
      String(s.quantitySold),
      s.sellPrice != null ? String(s.sellPrice) : '',
      s.revenue != null ? String(s.revenue) : '',
      s.soldAt,
    ]);
  }
  triggerDownload(buildCsv(rows), `sales-${new Date().toISOString().slice(0,10)}.csv`);
}
