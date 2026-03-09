# High-Impact Features Design
**Date:** 2026-03-09
**Status:** Approved, pending implementation

---

## Overview

Four features to implement in order of priority:

1. Barcode Auto-Lookup (Open Food Facts)
2. Low Stock Alerts
3. Price Fields + Revenue Analytics
4. Stock Receive Flow

---

## Feature 1 — Barcode Auto-Lookup

**Trigger:** After barcode is scanned or manually typed in ScanPage (debounced 600ms).

**API:** `GET https://world.openfoodfacts.org/api/v0/product/{barcode}.json`

**Behaviour:**
- If `status === 1` → silently populate `name` (from `product_name` or `product_name_en`) and `category` (mapped from `categories_tags`)
- A small "Auto-filled from database" chip appears below the name field
- If API returns nothing or fails → silent, form stays blank as today
- No blocking — fire-and-forget

**New file:** `src/utils/barcodeApi.ts`
- Export `lookupBarcode(code: string): Promise<{ name: string; category: string } | null>`
- Map Open Food Facts category tags to the app's fixed category list

**Changes:**
- `ScanPage.tsx` — call `lookupBarcode` when barcode field changes (debounced), apply result to form state, show chip

---

## Feature 2 — Low Stock Alerts

**Data model:**
- Add `min_qty` column (nullable `numeric`) to `products` table
- `null` = use store-wide default
- Store-wide default: `lowStockThreshold: number` (default `5`) stored in `SettingsContext` + localStorage

**Low stock condition:** `product.quantity <= (product.min_qty ?? storeDefault)`

**Where alerts appear:**
- `StorePage` product list — amber `LOW` badge on the product card quantity
- `StorePage` alert chips row — new amber chip "X low stock" alongside expired/soon chips, clicking filters to low-stock products
- `ProductPage` — "Min Stock Qty" number input in the Stock card section (optional, overrides store default)

**Settings:**
- Add "Low stock threshold" number input to SettingsPage under a new "Inventory" section
- Persisted in `SettingsContext` as `lowStockThreshold`

**Schema change:**
```sql
alter table products add column if not exists min_qty numeric;
```

**Changes:**
- `src/contexts/SettingsContext.tsx` — add `lowStockThreshold: number`
- `src/utils/storage.ts` — pass `minQty` through `saveProduct` / `updateProduct`
- `src/types/index.ts` — add `minQty: number | null` to `Product`
- `src/pages/StorePage.tsx` — low stock badge + alert chip
- `src/pages/ProductPage.tsx` — min qty field in Stock section
- `src/pages/ScanPage.tsx` — min qty field in form
- `src/pages/SettingsPage.tsx` — threshold input

---

## Feature 3 — Price Fields + Revenue Analytics

**Data model — products:**
- `cost_price` nullable `numeric` — what was paid to supplier
- `sell_price` nullable `numeric` — what is charged to customer

**Data model — sales:**
- `sell_price` nullable `numeric` — snapshot of price at time of sale
- `revenue` nullable `numeric` — `sell_price × quantity_sold`, computed on save

**ProductPage / ScanPage:** New "Pricing" card section with Cost Price and Sell Price fields (both optional, labelled with ฿).

**SellPage:** When confirming a sale, record `sell_price` and `revenue` from each cart item's product.

**AnalyticsPage changes:**
- Two new KPI cards: **Revenue** (฿ sum of `revenue`) and **Gross Profit** (฿ revenue − cost)
- Bar chart gains a second revenue series (lighter fill)
- Top products table adds a revenue column

**Schema changes:**
```sql
alter table products add column if not exists cost_price numeric;
alter table products add column if not exists sell_price numeric;
alter table sales    add column if not exists sell_price numeric;
alter table sales    add column if not exists revenue    numeric;
```

**Changes:**
- `src/types/index.ts` — add `costPrice`, `sellPrice` to `Product`
- `src/utils/storage.ts` — `Sale` type + `recordSale` include `sellPrice` / `revenue`; product CRUD passes new fields
- `src/pages/ProductPage.tsx` — Pricing card
- `src/pages/ScanPage.tsx` — Pricing fields
- `src/pages/SellPage.tsx` — capture price on confirm
- `src/pages/AnalyticsPage.tsx` — new KPIs + revenue bar series + top products revenue column

---

## Feature 4 — Stock Receive Flow

**Where:** ScanPage gets a mode toggle at the top: **Add New | Receive Stock**. Default is Add New.

**Receive mode flow:**
1. Scan barcode (or type manually)
2. **If barcode found in store** → show compact receive panel:
   - Product name (read-only)
   - Qty to receive (number input, required)
   - Expiry date (date input, required)
   - "Receive" button
3. **On save logic in `receiveStock()`:**
   - Find all product rows with the same `barcode` in the store
   - If a row with the **exact same `expiry_date`** exists → increment its `quantity`
   - Otherwise → create a new product row copying `name`, `category`, `unit`, `sell_price`, `cost_price`, `min_qty` from the most recent existing batch; new `expiry_date` + `quantity`
4. **If barcode NOT found** → auto-switch to Add New mode with barcode pre-filled
5. After saving → reset barcode + qty + expiry, stay in Receive mode for next item

**New storage function:** `receiveStock(storeId, barcode, qty, expiryDate): Promise<Product>`

**Changes:**
- `src/utils/storage.ts` — add `receiveStock()`
- `src/pages/ScanPage.tsx` — mode toggle + receive panel UI

---

## Schema Migration (all at once)

Run this in Supabase SQL Editor before deploying:

```sql
alter table products add column if not exists min_qty     numeric;
alter table products add column if not exists cost_price  numeric;
alter table products add column if not exists sell_price  numeric;
alter table sales    add column if not exists sell_price  numeric;
alter table sales    add column if not exists revenue     numeric;
```

No RLS changes needed — existing policies cover the new columns.

---

## Implementation Order

1. Schema migration (SQL)
2. `types/index.ts` — update Product + Sale types
3. `utils/storage.ts` — update all CRUD + add `receiveStock`
4. `utils/barcodeApi.ts` — new file
5. `contexts/SettingsContext.tsx` — add `lowStockThreshold`
6. `pages/ScanPage.tsx` — barcode lookup + receive mode + new fields
7. `pages/ProductPage.tsx` — pricing + min qty fields
8. `pages/StorePage.tsx` — low stock badge + alert chip
9. `pages/SellPage.tsx` — capture price on confirm
10. `pages/AnalyticsPage.tsx` — revenue KPIs + chart series
11. `pages/SettingsPage.tsx` — low stock threshold input
