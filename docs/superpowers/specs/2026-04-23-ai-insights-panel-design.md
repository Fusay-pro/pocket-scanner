# AI Insights Panel — Design Spec

**Date:** 2026-04-23  
**Feature:** AI Recommendation System (on-demand, cached)  
**Status:** Approved

---

## Overview

Add an AI Insights panel to the existing Analytics page. Users tap a button to trigger an on-demand AI analysis of their inventory and sales data. The result is cached in localStorage and rendered as structured UI cards — not a chat interface. The panel is visually distinct from the existing AI Chatbot (AIChatPanel).

---

## Architecture

### New Files
- `src/utils/aiRecommendations.ts` — builds the AI prompt, calls the existing `sendChatMessage`, parses the JSON response, handles localStorage caching
- `src/components/AIInsightsPanel.tsx` — the UI panel, embedded in AnalyticsPage below the existing stats sections

### Modified Files
- `src/pages/AnalyticsPage.tsx` — import and render `AIInsightsPanel`, pass already-loaded `products` and `sales` as props

### Reuses (no changes needed)
- `src/utils/aiChat.ts` → `sendChatMessage` — same API call used by the chatbot
- `src/utils/storage.ts` → `getProductsByStore`, `getSalesByStore` — already called in AnalyticsPage

---

## Data Flow

1. AnalyticsPage already loads `products` and `sales` on mount — these are passed as props to `AIInsightsPanel`
2. User taps **"Get AI Insights"** button
3. `aiRecommendations.ts` builds a structured prompt with:
   - Top 50 products (name, category, qty, minQty, sellPrice, costPrice)
   - Last 30 days of sales (productName, quantitySold, soldAt)
   - Low stock alerts, expired/expiring items
   - Store name and today's date
4. Calls `sendChatMessage` with `max_tokens: 1024`, instructs AI to return **valid JSON only**
5. Parses response into `AIInsightsResult` type
6. Saves to localStorage key: `ai_insights_${storeId}` with a timestamp
7. On re-open: loads from cache if `< 24 hours` old; shows "Last analyzed X ago" + Refresh button

---

## AI Response Schema

The prompt instructs the AI to return this exact JSON (no markdown, no prose):

```ts
interface AIInsightsResult {
  restockItems: {
    productName: string;
    currentQty: number;
    suggestedQty: number;
    reason: string;
  }[];
  watchItems: {
    productName: string;
    reason: string;
  }[];
  summary: string;
}
```

Parse with `JSON.parse`. On parse failure: show an error state with a Retry button.

---

## UI — AIInsightsPanel

**Location:** Bottom of AnalyticsPage, below the restock list section.

**States:**

| State | What's shown |
|-------|-------------|
| Empty (no cache) | "AI Insights" section header + "Analyze Inventory" button |
| Loading | Spinner + "Analyzing your inventory…" |
| Loaded | Timestamp + Refresh button + 3 sections below |
| Error | Error message + Retry button |

**Three output sections (when loaded):**

1. **Restock Now** — list of `restockItems` as cards: product name, current qty badge, suggested qty, one-line reason
2. **Watch These** — list of `watchItems`: product name + reason (trending up / predicted demand)
3. **Summary** — single text block with the AI's 2–3 sentence overall insight

**Styling:** Follows existing CSS patterns (`section-card`, `badge`, etc. from `index.css`). Uses `Sparkles` icon (already imported in the project via lucide-react).

---

## Caching

```ts
interface CachedInsights {
  result: AIInsightsResult;
  generatedAt: string; // ISO timestamp
  storeId: string;
}
```

- Key: `ai_insights_${storeId}`
- Expires: 24 hours from `generatedAt`
- Invalidated: user taps Refresh
- No automatic background refresh

---

## Error Handling

- AI call fails (network/API error) → show error message, keep any existing cached result visible below
- JSON parse fails → show "Couldn't parse AI response" + Retry
- No products/sales data → show "Add some products and sales data first" empty state, disable button

---

## Out of Scope

- Smart Scan (image recognition) — separate feature, not in this spec
- Chatbot integration fixes — separate task
- Supabase persistence of insights — localStorage only for now
- Multi-store aggregated insights — per-store only
