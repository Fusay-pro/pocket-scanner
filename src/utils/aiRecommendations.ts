import { sendChatMessage } from './aiChat';
import type { Product } from '../types';
import type { Sale } from './storage';
import { getExpiryStatus } from '../types';

export interface RestockItem {
  productName: string;
  currentQty: number;
  suggestedQty: number;
  reason: string;
}

export interface WatchItem {
  productName: string;
  reason: string;
}

export interface AIInsightsResult {
  restockItems: RestockItem[];
  watchItems: WatchItem[];
  summary: string;
}

interface CachedInsights {
  result: AIInsightsResult;
  generatedAt: string;
  storeId: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(storeId: string): string {
  return `ai_insights_${storeId}`;
}

export function loadCachedInsights(storeId: string): { result: AIInsightsResult; generatedAt: string } | null {
  try {
    const raw = localStorage.getItem(cacheKey(storeId));
    if (!raw) return null;
    const cached: CachedInsights = JSON.parse(raw);
    if (cached.storeId !== storeId) return null;
    const age = Date.now() - new Date(cached.generatedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return { result: cached.result, generatedAt: cached.generatedAt };
  } catch {
    return null;
  }
}

export function clearCachedInsights(storeId: string): void {
  localStorage.removeItem(cacheKey(storeId));
}

function saveCachedInsights(storeId: string, result: AIInsightsResult): string {
  const generatedAt = new Date().toISOString();
  const cached: CachedInsights = { result, generatedAt, storeId };
  localStorage.setItem(cacheKey(storeId), JSON.stringify(cached));
  return generatedAt;
}

function buildPrompt(storeName: string, products: Product[], sales: Sale[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const recentSales = sales.filter(s => new Date(s.soldAt) >= cutoff);

  const expired = products.filter(p => getExpiryStatus(p.expiryDate) === 'expired').map(p => p.name);
  const expiringSoon = products.filter(p => getExpiryStatus(p.expiryDate) === 'soon').map(p => p.name);

  const productLines = products.slice(0, 50).map(p => {
    const parts = [`${p.name} [${p.category}] qty:${p.quantity}${p.unit}`];
    if (p.minQty != null) parts.push(`min:${p.minQty}`);
    if (p.sellPrice != null) parts.push(`price:${p.sellPrice}`);
    if (p.costPrice != null) parts.push(`cost:${p.costPrice}`);
    return `- ${parts.join(' | ')}`;
  }).join('\n');

  const saleLines = recentSales.slice(0, 200).map(s =>
    `- ${s.soldAt.slice(0, 10)} | ${s.productName} | qty:${s.quantitySold}`
  ).join('\n');

  return `Store: ${storeName}
Date: ${today}

PRODUCTS (${products.length} total, showing ${Math.min(products.length, 50)}):
${productLines || 'No products.'}

SALES LAST 30 DAYS (${recentSales.length} transactions):
${saleLines || 'No recent sales.'}

LOW STOCK: ${products.filter(p => p.quantity <= (p.minQty ?? 5)).map(p => `${p.name}(${p.quantity})`).join(', ') || 'none'}
EXPIRED: ${expired.join(', ') || 'none'}
EXPIRING SOON: ${expiringSoon.join(', ') || 'none'}`;
}

const SYSTEM_PROMPT = `You are an AI inventory analyst for Pocket Scanner.
Analyze the store data and respond with ONLY a valid JSON object — no prose, no markdown, no code blocks, no extra text.
The JSON must exactly match this schema:
{"restockItems":[{"productName":"string","currentQty":0,"suggestedQty":0,"reason":"string"}],"watchItems":[{"productName":"string","reason":"string"}],"summary":"string"}

Rules:
- restockItems: up to 5 products most urgently needing restocking, sorted by urgency. suggestedQty = units to ORDER (positive integer).
- watchItems: up to 3 products likely to sell more based on recent trends.
- summary: 2-3 sentences about overall inventory health and key actions.
- If data is insufficient, return empty arrays and explain in summary.
- Return ONLY the JSON object. No other text.`;

export async function fetchAIInsights(
  storeId: string,
  storeName: string,
  products: Product[],
  sales: Sale[],
): Promise<{ result: AIInsightsResult; generatedAt: string }> {
  const userContent = buildPrompt(storeName, products, sales);
  const raw = await sendChatMessage([{ role: 'user', content: userContent }], SYSTEM_PROMPT);

  // Strip markdown code fences (thinking blocks already stripped in sendChatMessage)
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const result: AIInsightsResult = JSON.parse(cleaned);

  if (!Array.isArray(result.restockItems) || !Array.isArray(result.watchItems) || typeof result.summary !== 'string') {
    throw new Error('Invalid response structure from AI');
  }

  const generatedAt = saveCachedInsights(storeId, result);
  return { result, generatedAt };
}
