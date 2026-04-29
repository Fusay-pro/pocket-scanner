# Product Photos Design

**Date:** 2026-04-29
**Status:** Approved

---

## Overview

Allow users to attach one photo per product. Photos are stored in Supabase Storage and displayed in three places: as a thumbnail on the product list, as a hero image on the product detail page, and as a small thumbnail in the sell page scan confirmation popup.

---

## Architecture

```
Scan page → camera capture → upload to Supabase Storage (product-images bucket)
                                      ↓
                              public URL saved to products.imageUrl
                                      ↓
              Product list (48px thumb) + Detail (hero) + Sell popup (64px thumb)
```

---

## Data Model

Add `imageUrl: string | null` to the `Product` interface in `src/types/index.ts`.

Add `image_url` column (`text`, nullable) to the `products` table in Supabase.

Supabase Storage bucket: `product-images` (public). File path: `{storeId}/{productId}.jpg`.

---

## New Utility

**`src/utils/productImage.ts`**
- `uploadProductImage(storeId, productId, base64: string): Promise<string>` — uploads JPEG to Supabase Storage, returns public URL
- `deleteProductImage(storeId, productId): Promise<void>` — removes old image when replaced

---

## UI Changes

### Scan Page (`src/pages/ScanPage.tsx`)
After the user fills in the form and taps Save (before actually saving), show a photo prompt:
- "Add a photo? (optional)"
- Two buttons: **Take Photo** (opens `<input type="file" accept="image/*" capture="environment">`) and **Skip**
- On photo selected: resize/compress to max 800px, upload, get URL
- On skip: save without imageUrl
- Flow: barcode scan → form fill → photo prompt → save

### Product List (`src/pages/StorePage.tsx` / product card component)
- Replace the existing box icon with a 48×48px rounded square image if `imageUrl` exists
- Fall back to the current box icon if no photo

### Product Detail (`src/pages/ProductPage.tsx`)
- Full-width hero image (height: 200px, `object-fit: cover`) at the top of the page if `imageUrl` exists
- "Change photo" button overlaid bottom-right of the hero
- If no photo: show a placeholder with a camera icon and "Add photo" text

### Sell Page (`src/pages/SellPage.tsx`)
- Scan confirmation popup: add 64×64px thumbnail on the left of the product row
- Falls back to box icon if no photo

---

## Storage & Auth

- Bucket `product-images` must be set to **public** in Supabase dashboard
- RLS: allow authenticated users to insert/delete their own store's images
- File naming: `{storeId}/{productId}.jpg` — overwrite on change (no versioning needed)

---

## Out of Scope

- Multiple photos per product
- Gallery view
- Photo cropping UI
- Android-specific camera plugins (web file input works on both web and Capacitor)
