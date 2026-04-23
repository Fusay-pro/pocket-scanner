# AI Insights Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand AI Insights panel to the Analytics page that analyzes inventory + sales data and renders structured recommendation cards, with 24h localStorage caching.

**Architecture:** A new utility (`aiRecommendations.ts`) builds the prompt, calls the existing `sendChatMessage` API, parses the JSON response, and manages caching. A new component (`AIInsightsPanel.tsx`) renders the result as three card sections. `AnalyticsPage.tsx` receives the panel after its existing restock table — products and sales are already loaded there.

**Tech Stack:** React 19, TypeScript, Vite, plain CSS, lucide-react icons, existing `sendChatMessage` from `src/utils/aiChat.ts`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/aiRecommendations.ts` | Create | Types, cache read/write, prompt builder, API call, JSON parser |
| `src/components/AIInsightsPanel.tsx` | Create | All UI states: empty, loading, loaded, error |
| `src/pages/AnalyticsPage.tsx` | Modify | Import + render `AIInsightsPanel` after restock table |
| `src/index.css` | Modify | Add CSS for new panel classes |

---

## Task 1: Create `src/utils/aiRecommendations.ts`

**Files:**
- Create: `src/utils/aiRecommendations.ts`

- [ ] **Step 1: Create the file with all types and cache helpers**

```ts
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

  // Strip markdown code fences if the model wraps the response
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const result: AIInsightsResult = JSON.parse(cleaned);

  if (!Array.isArray(result.restockItems) || !Array.isArray(result.watchItems) || typeof result.summary !== 'string') {
    throw new Error('Invalid response structure from AI');
  }

  const generatedAt = saveCachedInsights(storeId, result);
  return { result, generatedAt };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/fuse/pocket-scanner && npm run build 2>&1 | tail -20
```

Expected: build succeeds (the file is not yet imported anywhere, so no usage errors).

- [ ] **Step 3: Commit**

```bash
cd /Users/fuse/pocket-scanner && git add src/utils/aiRecommendations.ts && git commit -m "feat: add aiRecommendations utility with caching and prompt builder"
```

---

## Task 2: Add CSS to `src/index.css`

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Append AI Insights panel styles to the end of `src/index.css`**

```css
/* ─── AI Insights Panel ──────────────────────────────────────────────────── */
.ai-insights-section {
  margin: 12px 0 0;
}

.ai-insights-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.ai-insights-timestamp {
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-bottom: 12px;
}

.ai-insights-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted, #888);
  font-size: 14px;
  padding: 16px 0;
}

.ai-insights-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 0;
  color: var(--text-muted, #888);
  text-align: center;
  font-size: 14px;
}

.ai-insights-subsection {
  margin-top: 16px;
}

.ai-insights-subsection-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary, #555);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ai-restock-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: var(--surface-2, #f5f5f5);
  border-radius: 8px;
  margin-bottom: 6px;
}

.ai-restock-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-restock-name {
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-restock-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.ai-badge-current {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--danger-light, #fee2e2);
  color: var(--danger, #ef4444);
}

.ai-badge-suggested {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--success-light, #dcfce7);
  color: var(--success, #16a34a);
}

.ai-restock-reason {
  font-size: 12px;
  color: var(--text-muted, #888);
  line-height: 1.4;
}

.ai-watch-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  background: var(--surface-2, #f5f5f5);
  border-radius: 8px;
  margin-bottom: 6px;
}

.ai-watch-name {
  font-size: 14px;
  font-weight: 600;
}

.ai-watch-reason {
  font-size: 12px;
  color: var(--text-muted, #888);
}

.ai-summary-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary, #555);
  background: var(--surface-2, #f5f5f5);
  border-radius: 8px;
  padding: 12px;
}

.ai-insights-error {
  font-size: 13px;
  color: var(--danger, #ef4444);
  background: var(--danger-light, #fee2e2);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
```

- [ ] **Step 2: Verify build still passes**

```bash
cd /Users/fuse/pocket-scanner && npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/fuse/pocket-scanner && git add src/index.css && git commit -m "feat: add AI Insights panel CSS styles"
```

---

## Task 3: Create `src/components/AIInsightsPanel.tsx`

**Files:**
- Create: `src/components/AIInsightsPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect } from 'react';
import { Sparkles, Loader2, RefreshCw, TrendingUp, Package, AlertTriangle } from 'lucide-react';
import {
  fetchAIInsights,
  loadCachedInsights,
  clearCachedInsights,
  type AIInsightsResult,
} from '../utils/aiRecommendations';
import type { Product } from '../types';
import type { Sale } from '../utils/storage';

interface Props {
  storeId: string;
  storeName: string;
  products: Product[];
  sales: Sale[];
}

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AIInsightsPanel({ storeId, storeName, products, sales }: Props) {
  const [result, setResult] = useState<AIInsightsResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const cached = loadCachedInsights(storeId);
    if (cached) {
      setResult(cached.result);
      setGeneratedAt(cached.generatedAt);
    }
  }, [storeId]);

  async function handleAnalyze(force = false) {
    if (force) clearCachedInsights(storeId);
    setError('');
    setLoading(true);
    try {
      const { result: r, generatedAt: ts } = await fetchAIInsights(storeId, storeName, products, sales);
      setResult(r);
      setGeneratedAt(ts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed');
    } finally {
      setLoading(false);
    }
  }

  const hasData = products.length > 0;

  return (
    <div className="analytics-card ai-insights-section">
      <div className="ai-insights-header">
        <h3 className="analytics-section-title" style={{ margin: 0 }}>
          <Sparkles size={16} /> AI Insights
        </h3>
        {result && !loading && (
          <button className="btn-icon" onClick={() => handleAnalyze(true)} title="Refresh AI analysis">
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {generatedAt && (
        <p className="ai-insights-timestamp">Last analyzed {timeAgo(generatedAt)}</p>
      )}

      {error && (
        <div className="ai-insights-error" onClick={() => setError('')}>
          {error}
        </div>
      )}

      {loading && (
        <div className="ai-insights-loading">
          <Loader2 size={18} className="spin" />
          Analyzing your inventory…
        </div>
      )}

      {!result && !loading && (
        <div className="ai-insights-empty">
          {hasData ? (
            <>
              <Sparkles size={32} strokeWidth={1} />
              <p>Get AI-powered restock recommendations and demand predictions.</p>
              <button className="btn-primary" onClick={() => handleAnalyze(false)}>
                Analyze Inventory
              </button>
            </>
          ) : (
            <>
              <AlertTriangle size={28} strokeWidth={1} />
              <p>Add some products and sales data first.</p>
            </>
          )}
        </div>
      )}

      {result && !loading && (
        <>
          {result.restockItems.length > 0 && (
            <div className="ai-insights-subsection">
              <div className="ai-insights-subsection-title">
                <Package size={13} /> Restock Now
              </div>
              {result.restockItems.map((item, i) => (
                <div key={i} className="ai-restock-card">
                  <div className="ai-restock-card-row">
                    <span className="ai-restock-name">{item.productName}</span>
                    <div className="ai-restock-badges">
                      <span className="ai-badge-current">Now: {item.currentQty}</span>
                      <span className="ai-badge-suggested">Order: +{item.suggestedQty}</span>
                    </div>
                  </div>
                  <p className="ai-restock-reason">{item.reason}</p>
                </div>
              ))}
            </div>
          )}

          {result.watchItems.length > 0 && (
            <div className="ai-insights-subsection">
              <div className="ai-insights-subsection-title">
                <TrendingUp size={13} /> Watch These
              </div>
              {result.watchItems.map((item, i) => (
                <div key={i} className="ai-watch-item">
                  <span className="ai-watch-name">{item.productName}</span>
                  <span className="ai-watch-reason">{item.reason}</span>
                </div>
              ))}
            </div>
          )}

          {result.summary && (
            <div className="ai-insights-subsection">
              <div className="ai-insights-subsection-title">
                <Sparkles size={13} /> Summary
              </div>
              <p className="ai-summary-text">{result.summary}</p>
            </div>
          )}

          {result.restockItems.length === 0 && result.watchItems.length === 0 && (
            <div className="ai-insights-empty" style={{ padding: '12px 0' }}>
              <p>{result.summary || 'No recommendations at this time.'}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/fuse/pocket-scanner && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors (the component is not yet imported, so no usage errors).

- [ ] **Step 3: Commit**

```bash
cd /Users/fuse/pocket-scanner && git add src/components/AIInsightsPanel.tsx && git commit -m "feat: add AIInsightsPanel component"
```

---

## Task 4: Wire `AIInsightsPanel` into `AnalyticsPage.tsx`

**Files:**
- Modify: `src/pages/AnalyticsPage.tsx`

- [ ] **Step 1: Add the import at the top of `AnalyticsPage.tsx`**

Find the existing import block (around line 15) and add:

```ts
import AIInsightsPanel from '../components/AIInsightsPanel';
```

- [ ] **Step 2: Add the panel after the restock table block**

Find this closing fragment tag and the export section that follows:

```tsx
      </> /* end isOwner guard */}

      {isOwner && (
        <div className="export-section">
```

Replace with:

```tsx
      </> /* end isOwner guard */}

      {isOwner && store && (
        <AIInsightsPanel
          storeId={storeId!}
          storeName={store.name}
          products={products}
          sales={sales}
        />
      )}

      {isOwner && (
        <div className="export-section">
```

- [ ] **Step 3: Verify it compiles with no errors**

```bash
cd /Users/fuse/pocket-scanner && npm run build 2>&1 | tail -20
```

Expected: clean build, zero TypeScript errors.

- [ ] **Step 4: Run lint**

```bash
cd /Users/fuse/pocket-scanner && npm run lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/fuse/pocket-scanner && git add src/pages/AnalyticsPage.tsx && git commit -m "feat: wire AIInsightsPanel into AnalyticsPage"
```

---

## Task 5: Manual Smoke Test

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/fuse/pocket-scanner && npm run dev
```

Open the app in the browser. Navigate to a store → Analytics tab.

- [ ] **Step 2: Verify empty state**

With no products: panel shows "Add some products and sales data first." — button is absent.
With products: panel shows the "Analyze Inventory" button.

- [ ] **Step 3: Trigger analysis**

Tap "Analyze Inventory". Verify:
- Loading spinner appears with "Analyzing your inventory…"
- After response: "Last analyzed just now" timestamp appears
- At least one of Restock Now / Watch These / Summary sections renders

- [ ] **Step 4: Verify caching**

Reload the page. Verify the panel shows the previous result immediately (no loading state) and the timestamp reflects the prior analysis time.

- [ ] **Step 5: Verify Refresh**

Tap the refresh icon (↺) in the panel header. Verify a fresh API call is made (loading spinner re-appears).

- [ ] **Step 6: Verify error state**

Temporarily corrupt `VITE_AI_BASE_URL` in `.env.local` to a bad value, reload and re-analyze. Verify error message appears and the old cached result (if any) is cleared. Restore the correct value after.

- [ ] **Step 7: Final commit if any small fixes were made**

```bash
cd /Users/fuse/pocket-scanner && git add -p && git commit -m "fix: smoke test corrections for AI Insights panel"
```

---

## Definition of Done

- `npm run build` passes with zero errors
- `npm run lint` passes with zero warnings
- Panel appears on Analytics page (owner-only, same guard as existing sections)
- Empty state renders when no products exist
- Loading state renders during API call
- Three sections (Restock Now, Watch These, Summary) render on success
- Result persists across page reloads for 24h
- Refresh button triggers a new API call
- Error state renders on API/parse failure
