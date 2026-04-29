# Product Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users attach one optional photo per product, stored in Supabase Storage, shown as a thumbnail on the product list, hero on the product detail page, and small thumbnail in the sell page scan confirmation.

**Architecture:** Photos are uploaded to a public Supabase Storage bucket (`product-images`) at path `{storeId}/{productId}.jpg`. The public URL is stored in `products.image_url` (Supabase) / `imageUrl` (TypeScript). A new `src/utils/productImage.ts` handles upload/delete. The scan page shows a photo prompt after form fill. Three UI locations render the photo.

**Tech Stack:** Supabase Storage, React, TypeScript, `<input type="file" accept="image/*" capture="environment">`

---

## Files

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `imageUrl: string \| null` to `Product` |
| `src/utils/storage.ts` | Map `image_url` in `rowToProduct`, pass `image_url` in `saveProduct` and `updateProduct` |
| `src/utils/productImage.ts` | New — upload and delete product photos |
| `src/pages/ScanPage.tsx` | Add photo prompt step before saving |
| `src/pages/StorePage.tsx` | Show 48px thumbnail on product card |
| `src/pages/ProductPage.tsx` | Show hero image + change photo button |
| `src/pages/SellPage.tsx` | Show 64px thumbnail in scan/add confirmation row |
| `src/App.css` | Styles for product photo thumbnail, hero, sell thumbnail |

---

### Task 1: Add `imageUrl` to Product type and storage layer

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/utils/storage.ts`

- [ ] **Step 1: Add `imageUrl` to Product interface**

In `src/types/index.ts`, add `imageUrl: string | null;` after `supplier`:

```ts
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
  supplier: string | null;
  imageUrl: string | null;
}
```

- [ ] **Step 2: Map `image_url` in `rowToProduct`**

In `src/utils/storage.ts`, update `rowToProduct` to include `imageUrl`:

```ts
function rowToProduct(row: any): Product {
  return {
    id: row.id, storeId: row.store_id, barcode: row.barcode,
    name: row.name, category: row.category, quantity: row.quantity,
    unit: row.unit, expiryDate: row.expiry_date ?? null,
    addedAt: row.added_at, notes: row.notes,
    minQty: row.min_qty ?? null,
    costPrice: row.cost_price ?? null,
    sellPrice: row.sell_price ?? null,
    supplier: row.supplier ?? null,
    imageUrl: row.image_url ?? null,
  };
}
```

- [ ] **Step 3: Pass `image_url` in `saveProduct`**

In `src/utils/storage.ts`, update the Supabase insert in `saveProduct` to include `image_url`:

```ts
const { data, error } = await supabase.from('products').insert({
  store_id: product.storeId, barcode: product.barcode, name: product.name,
  category: product.category, quantity: product.quantity, unit: product.unit,
  expiry_date: product.expiryDate, notes: product.notes,
  min_qty: product.minQty ?? null,
  cost_price: product.costPrice ?? null,
  sell_price: product.sellPrice ?? null,
  supplier: product.supplier ?? null,
  image_url: product.imageUrl ?? null,
}).select().single();
```

Also update the localStorage fallback in `saveProduct`:
```ts
const newProduct: Product = { ...product, id: generateId(), addedAt: new Date().toISOString() };
```
(This already spreads `product` which now includes `imageUrl` — no change needed here.)

- [ ] **Step 4: Add `image_url` column in Supabase**

Run this SQL in the Supabase dashboard → SQL Editor:

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/storage.ts
git commit -m "feat: add imageUrl to Product type and storage layer"
```

---

### Task 2: Create `productImage.ts` upload utility

**Files:**
- Create: `src/utils/productImage.ts`

- [ ] **Step 1: Create the file**

Create `src/utils/productImage.ts`:

```ts
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
```

- [ ] **Step 2: Create the Supabase Storage bucket**

In Supabase dashboard → Storage → New bucket:
- Name: `product-images`
- Public: **yes**

Then add this RLS policy in SQL Editor so authenticated users can upload:

```sql
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/utils/productImage.ts
git commit -m "feat: add productImage upload utility"
```

---

### Task 3: Photo prompt on Scan page

**Files:**
- Modify: `src/pages/ScanPage.tsx`

- [ ] **Step 1: Add photo state and imports**

At the top of `ScanPage.tsx`, add the import:

```ts
import { uploadProductImage } from '../utils/productImage';
```

Add these state variables inside the component (after existing state):

```ts
const [photoBase64, setPhotoBase64] = useState<string | null>(null);
const [photoPromptVisible, setPhotoPromptVisible] = useState(false);
const [photoUploading, setPhotoUploading] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 2: Add `resizeImage` helper function**

Add this function inside the component, before `handleSave`:

```ts
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}
```

- [ ] **Step 3: Modify `handleSave` to show photo prompt first**

Replace the existing `handleSave` function with:

```ts
async function handleSave() {
  if (!storeId || !form.name.trim()) return;
  if (
    hasInvalidNum(form.quantity) || hasInvalidNum(form.costPrice) ||
    hasInvalidNum(form.sellPrice) || hasInvalidNum(form.minQty)
  ) { setError(tr('validationNumberInvalid')); return; }

  if (!photoPromptVisible) {
    setPhotoPromptVisible(true);
    return;
  }
  await doSave();
}

async function doSave(imageUrl?: string) {
  if (!storeId) return;
  setSaving(true);
  try {
    const savedProd = await saveProduct({
      storeId,
      barcode: form.barcode.trim(),
      name: form.name.trim(),
      category: form.category,
      quantity: Number(form.quantity) || 1,
      unit: form.unit,
      expiryDate: form.expiryDate || null,
      notes: form.notes.trim(),
      costPrice: form.costPrice !== '' ? Number(form.costPrice) : null,
      sellPrice: form.sellPrice !== '' ? Number(form.sellPrice) : null,
      minQty: form.minQty !== '' ? Number(form.minQty) : null,
      supplier: form.supplier.trim() || null,
      imageUrl: imageUrl ?? null,
    });
    setRecentProducts(prev => [savedProd, ...prev].slice(0, 4));
    if (form.barcode.trim()) {
      setCachedBarcode(form.barcode.trim(), form.name.trim(), form.category).catch(() => {});
    }
    setSaved(true);
    setForm({ ...EMPTY_FORM, unit: defaultUnit });
    setScannedCode('');
    setAutoFilled(false);
    setPhotoPromptVisible(false);
    setPhotoBase64(null);
    setTimeout(() => setSaved(false), 2000);
  } catch (e) {
    setError(errMsg(e));
  } finally {
    setSaving(false);
  }
}
```

- [ ] **Step 4: Add photo capture handler**

Add this function inside the component:

```ts
async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const b64 = await resizeImage(file);
    setPhotoBase64(b64);
  } catch {
    setError('Could not process photo');
  }
}

async function handlePhotoConfirm() {
  if (!photoBase64 || !storeId) { await doSave(); return; }
  setPhotoUploading(true);
  try {
    const tempId = `temp-${Date.now()}`;
    const url = await uploadProductImage(storeId, tempId, photoBase64);
    await doSave(url);
  } catch {
    setError('Photo upload failed — product saved without photo');
    await doSave();
  } finally {
    setPhotoUploading(false);
  }
}
```

- [ ] **Step 5: Add photo prompt UI**

In the JSX, just before the Save button (`btn-primary full-width`), add:

```tsx
{photoPromptVisible && (
  <div className="photo-prompt">
    <p className="photo-prompt-label">Add a photo? (optional)</p>
    {photoBase64 ? (
      <img src={photoBase64} className="photo-preview" alt="preview" />
    ) : null}
    <div className="photo-prompt-actions">
      <button
        type="button"
        className="btn-secondary"
        onClick={() => fileInputRef.current?.click()}
      >
        <Camera size={15} /> {photoBase64 ? 'Retake' : 'Take Photo'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handlePhotoSelected}
      />
      <button
        type="button"
        className="btn-primary"
        onClick={handlePhotoConfirm}
        disabled={photoUploading || saving}
      >
        {photoUploading ? <><Loader2 size={14} className="spin" /> Uploading…</> : 'Save'}
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => doSave()}
        disabled={saving}
      >
        Skip
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Add CSS for photo prompt**

In `src/App.css`, add at the end:

```css
/* ===== Product Photo ===== */
.photo-prompt {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: var(--surface-2);
  border-radius: var(--radius);
  margin-bottom: 8px;
}
.photo-prompt-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.photo-prompt-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.photo-preview {
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}
.product-thumb {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
}
.product-thumb-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  flex-shrink: 0;
}
.product-hero {
  width: 100%;
  height: 200px;
  object-fit: cover;
}
.product-hero-placeholder {
  width: 100%;
  height: 200px;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: var(--text-faint);
  font-size: 13px;
}
.product-hero-wrap {
  position: relative;
}
.change-photo-btn {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0,0,0,0.45);
  color: #fff;
  border: none;
  border-radius: 20px;
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}
.sell-thumb {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.sell-thumb-placeholder {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  flex-shrink: 0;
}
```

- [ ] **Step 7: Verify build**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/ScanPage.tsx src/App.css
git commit -m "feat: add photo prompt to scan page"
```

---

### Task 4: Thumbnail on product list (StorePage)

**Files:**
- Modify: `src/pages/StorePage.tsx`

- [ ] **Step 1: Add thumbnail to product card**

In `src/pages/StorePage.tsx`, find the `card-body` div that contains the `expiry-badge` and `card-info`. Add the thumbnail just before `expiry-badge`:

```tsx
<div className="card-body">
  {editMode && (
    <input
      type="checkbox"
      className="bulk-checkbox"
      checked={selected.has(product.id)}
      onChange={e => {
        e.stopPropagation();
        setSelected(prev => {
          const next = new Set(prev);
          if (next.has(product.id)) next.delete(product.id);
          else next.add(product.id);
          return next;
        });
      }}
    />
  )}
  {product.imageUrl ? (
    <img src={product.imageUrl} className="product-thumb" alt={product.name} />
  ) : (
    <div className="product-thumb-placeholder">
      <Package size={20} />
    </div>
  )}
  <div className={`expiry-badge badge-${status}`}>
    {/* existing expiry badge content unchanged */}
  </div>
  <div className="card-info">
    {/* existing card-info content unchanged */}
  </div>
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/StorePage.tsx
git commit -m "feat: show product photo thumbnail on product list"
```

---

### Task 5: Hero image on product detail (ProductPage)

**Files:**
- Modify: `src/pages/ProductPage.tsx`

- [ ] **Step 1: Add photo state and imports**

Add import at top of `ProductPage.tsx`:

```ts
import { uploadProductImage } from '../utils/productImage';
```

Add state inside the component:

```ts
const [photoUploading, setPhotoUploading] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 2: Add photo change handler**

Add this function inside the component:

```ts
async function handleChangePhoto(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file || !product) return;
  setPhotoUploading(true);
  try {
    const img = new Image();
    const url = URL.createObjectURL(file);
    const b64 = await new Promise<string>((resolve, reject) => {
      img.onload = () => {
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = url;
    });
    const imageUrl = await uploadProductImage(product.storeId, product.id, b64);
    await updateProduct(product.id, { imageUrl });
    setProduct(prev => prev ? { ...prev, imageUrl } : prev);
  } catch {
    setError('Photo upload failed');
  } finally {
    setPhotoUploading(false);
  }
}
```

- [ ] **Step 3: Add hero image to JSX**

Find the existing `pp-hero` div at the top of the return statement in `ProductPage.tsx`. Add the hero image **above** it (before the `<header>` or at the very top of the page content):

```tsx
<div className="product-hero-wrap">
  {product.imageUrl ? (
    <>
      <img src={product.imageUrl} className="product-hero" alt={product.name} />
      <button
        className="change-photo-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={photoUploading}
      >
        <Camera size={12} /> {photoUploading ? 'Uploading…' : 'Change photo'}
      </button>
    </>
  ) : (
    <div className="product-hero-placeholder" onClick={() => fileInputRef.current?.click()}>
      <Camera size={28} />
      <span>Add photo</span>
    </div>
  )}
  <input
    ref={fileInputRef}
    type="file"
    accept="image/*"
    capture="environment"
    style={{ display: 'none' }}
    onChange={handleChangePhoto}
  />
</div>
```

Make sure `Camera` is imported from `lucide-react` and `updateProduct` is imported from `../utils/storage`.

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProductPage.tsx
git commit -m "feat: show product hero photo on product detail page"
```

---

### Task 6: Thumbnail in sell page scan confirmation

**Files:**
- Modify: `src/pages/SellPage.tsx`

- [ ] **Step 1: Add thumbnail to cart item row**

In `src/pages/SellPage.tsx`, find the `cart-item` div. Add a thumbnail before `cart-item-info`:

```tsx
<div key={item.product.id} className="cart-item">
  {item.product.imageUrl ? (
    <img src={item.product.imageUrl} className="sell-thumb" alt={item.product.name} />
  ) : (
    <div className="sell-thumb-placeholder">
      <Package size={18} />
    </div>
  )}
  <div className="cart-item-info">
    <p className="cart-item-name">{item.product.name}</p>
    <p className="cart-item-meta">
      {item.product.category} · {tr('stockLabel')} {item.product.quantity}
      {item.product.expiryDate && <span> · Exp: {formatDate(item.product.expiryDate)}</span>}
    </p>
  </div>
  <div className="cart-qty-controls">
    {/* existing qty controls unchanged */}
  </div>
</div>
```

Make sure `Package` is imported from `lucide-react`.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SellPage.tsx
git commit -m "feat: show product thumbnail in sell page cart"
```
