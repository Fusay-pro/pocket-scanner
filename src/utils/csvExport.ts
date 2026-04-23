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

async function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  if (navigator.share) {
    const file = new File([blob], filename, { type: 'text/csv' });
    await navigator.share({ files: [file], title: filename });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

export async function exportInventoryCsv(stores: Store[], products: Product[]) {
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
  await triggerDownload(buildCsv(rows), `inventory-${new Date().toISOString().slice(0,10)}.csv`);
}

export async function exportSalesCsv(stores: Store[], sales: Sale[]) {
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
  await triggerDownload(buildCsv(rows), `sales-${new Date().toISOString().slice(0,10)}.csv`);
}

export interface ImportedProduct {
  storeId: string;
  barcode: string;
  name: string;
  category: string;
  supplier: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  costPrice: number | null;
  sellPrice: number | null;
  minQty: number | null;
  notes: string;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current); current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export function parseInventoryCsv(csv: string, storeMap: Record<string, string>): ImportedProduct[] {
  const lines = csv.trim().split('\n');
  const storeNameToId = Object.fromEntries(Object.entries(storeMap).map(([id, name]) => [name, id]));
  return lines.slice(1).map(line => {
    const [store, name, barcode, category, supplier, quantity, unit, expiryDate, costPrice, sellPrice, minQty] = parseCsvLine(line);
    return {
      storeId: storeNameToId[store] ?? Object.keys(storeMap)[0],
      barcode: barcode ?? '',
      name: name ?? '',
      category: category ?? 'Other',
      supplier: supplier ?? '',
      quantity: parseFloat(quantity) || 0,
      unit: unit ?? 'pcs',
      expiryDate: expiryDate ?? '',
      costPrice: costPrice ? parseFloat(costPrice) : null,
      sellPrice: sellPrice ? parseFloat(sellPrice) : null,
      minQty: minQty ? parseFloat(minQty) : null,
      notes: '',
    };
  }).filter(p => p.name);
}
