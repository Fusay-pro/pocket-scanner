/**
 * Storage layer — Supabase + localStorage fallback.
 * Supabase RLS enforces role permissions server-side.
 * The UI additionally hides controls based on role (defence in depth).
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Store, Product } from '../types';

export type MemberRole = 'owner' | 'worker';

export interface StoreMember {
  userId: string;
  email: string;
  role: MemberRole;
}

export interface StoreInvitation {
  id: string;
  invitedEmail: string;
  role: MemberRole;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
// Persists across tab switches (SPA), invalidated on any write.

const productCache = new Map<string, Product[]>();
const storeCache: { data: Store[] | null } = { data: null };

function invalidateProductCache(storeId: string) { productCache.delete(storeId); }
function invalidateAllProductCache() { productCache.clear(); }
function invalidateStoreCache() { storeCache.data = null; }

const LS_STORES = 'pocket_scanner_stores';
const LS_PRODUCTS = 'pocket_scanner_products';

function lsGet<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function lsSet<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Row converters ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToStore(row: any): Store {
  return { id: row.id, name: row.name, location: row.location, createdAt: row.created_at };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProduct(row: any): Product {
  return {
    id: row.id, storeId: row.store_id, barcode: row.barcode,
    name: row.name, category: row.category, quantity: row.quantity,
    unit: row.unit, expiryDate: row.expiry_date ?? null,
    addedAt: row.added_at, notes: row.notes,
    minQty: row.min_qty ?? null,
    costPrice: row.cost_price ?? null,
    sellPrice: row.sell_price ?? null,
  };
}

// ─── STORES ───────────────────────────────────────────────────────────────────

export async function getStores(): Promise<Store[]> {
  if (storeCache.data) return storeCache.data;
  if (!isSupabaseConfigured) return lsGet<Store>(LS_STORES);
  const { data, error } = await supabase
    .from('stores').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  storeCache.data = (data ?? []).map(rowToStore);
  return storeCache.data;
}

export async function saveStore(store: Omit<Store, 'id' | 'createdAt'>): Promise<Store> {
  invalidateStoreCache();
  if (!isSupabaseConfigured) {
    const stores = lsGet<Store>(LS_STORES);
    const newStore: Store = { ...store, id: generateId(), createdAt: new Date().toISOString() };
    lsSet(LS_STORES, [newStore, ...stores]);
    return newStore;
  }

  const { data, error } = await supabase
    .rpc('create_store_with_owner', {
      p_name: store.name,
      p_location: store.location,
    })
    .single();

  if (error) {
    if (error.message?.includes('create_store_with_owner')) {
      throw new Error('Supabase schema is outdated. Run the SQL in supabase_schema.sql, then try again.');
    }
    throw error;
  }

  return rowToStore(data);
}

export async function updateStore(id: string, updates: Partial<Omit<Store, 'id' | 'createdAt'>>): Promise<void> {
  invalidateStoreCache();
  if (!isSupabaseConfigured) {
    lsSet(LS_STORES, lsGet<Store>(LS_STORES).map(s => s.id === id ? { ...s, ...updates } : s));
    return;
  }
  const { error } = await supabase.from('stores').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteStore(id: string): Promise<void> {
  invalidateStoreCache();
  invalidateAllProductCache();
  if (!isSupabaseConfigured) {
    lsSet(LS_STORES, lsGet<Store>(LS_STORES).filter(s => s.id !== id));
    lsSet(LS_PRODUCTS, lsGet<Product>(LS_PRODUCTS).filter(p => p.storeId !== id));
    return;
  }
  const { error } = await supabase.from('stores').delete().eq('id', id);
  if (error) throw error;
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured) return lsGet<Product>(LS_PRODUCTS);
  const { data, error } = await supabase
    .from('products').select('*').order('added_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToProduct);
}

export async function getProductsByStore(storeId: string): Promise<Product[]> {
  if (productCache.has(storeId)) return productCache.get(storeId)!;
  if (!isSupabaseConfigured) return lsGet<Product>(LS_PRODUCTS).filter(p => p.storeId === storeId);
  const { data, error } = await supabase
    .from('products').select('*').eq('store_id', storeId).order('added_at', { ascending: false });
  if (error) throw error;
  const products = (data ?? []).map(rowToProduct);
  productCache.set(storeId, products);
  return products;
}

export async function saveProduct(product: Omit<Product, 'id' | 'addedAt'>): Promise<Product> {
  invalidateProductCache(product.storeId);
  if (!isSupabaseConfigured) {
    const products = lsGet<Product>(LS_PRODUCTS);
    const newProduct: Product = { ...product, id: generateId(), addedAt: new Date().toISOString() };
    lsSet(LS_PRODUCTS, [newProduct, ...products]);
    return newProduct;
  }
  const { data, error } = await supabase.from('products').insert({
    store_id: product.storeId, barcode: product.barcode, name: product.name,
    category: product.category, quantity: product.quantity, unit: product.unit,
    expiry_date: product.expiryDate, notes: product.notes,
    min_qty: product.minQty ?? null,
    cost_price: product.costPrice ?? null,
    sell_price: product.sellPrice ?? null,
  }).select().single();
  if (error) throw error;
  return rowToProduct(data);
}

export async function updateProduct(id: string, updates: Partial<Omit<Product, 'id' | 'addedAt'>>): Promise<void> {
  invalidateAllProductCache();
  if (!isSupabaseConfigured) {
    lsSet(LS_PRODUCTS, lsGet<Product>(LS_PRODUCTS).map(p => p.id === id ? { ...p, ...updates } : p));
    return;
  }
  const dbUpdates: Record<string, unknown> = {};
  if (updates.barcode    !== undefined) dbUpdates.barcode     = updates.barcode;
  if (updates.name       !== undefined) dbUpdates.name        = updates.name;
  if (updates.category   !== undefined) dbUpdates.category    = updates.category;
  if (updates.quantity   !== undefined) dbUpdates.quantity    = updates.quantity;
  if (updates.unit       !== undefined) dbUpdates.unit        = updates.unit;
  if (updates.expiryDate !== undefined) dbUpdates.expiry_date = updates.expiryDate;
  if (updates.notes      !== undefined) dbUpdates.notes       = updates.notes;
  if (updates.minQty     !== undefined) dbUpdates.min_qty     = updates.minQty;
  if (updates.costPrice  !== undefined) dbUpdates.cost_price  = updates.costPrice;
  if (updates.sellPrice  !== undefined) dbUpdates.sell_price  = updates.sellPrice;
  const { error } = await supabase.from('products').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  invalidateAllProductCache();
  if (!isSupabaseConfigured) {
    lsSet(LS_PRODUCTS, lsGet<Product>(LS_PRODUCTS).filter(p => p.id !== id));
    return;
  }
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAllProductsByStore(storeId: string): Promise<void> {
  invalidateProductCache(storeId);
  if (!isSupabaseConfigured) {
    lsSet(LS_PRODUCTS, lsGet<Product>(LS_PRODUCTS).filter(p => p.storeId !== storeId));
    return;
  }
  const { error } = await supabase.from('products').delete().eq('store_id', storeId);
  if (error) throw error;
}

export async function receiveStock(
  storeId: string, barcode: string, qty: number, expiryDate: string
): Promise<Product> {
  const all = await getProductsByStore(storeId);
  const batches = all.filter(p => p.barcode === barcode);

  if (batches.length === 0) throw new Error('BARCODE_NOT_FOUND');

  // Check for exact expiry date match
  const existing = batches.find(p => p.expiryDate === expiryDate);
  if (existing) {
    await updateProduct(existing.id, { quantity: existing.quantity + qty });
    return { ...existing, quantity: existing.quantity + qty };
  }

  // New batch — copy fields from most recent existing batch
  const template = batches.sort((a, b) =>
    new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  )[0];

  return saveProduct({
    storeId,
    barcode,
    name: template.name,
    category: template.category,
    unit: template.unit,
    sellPrice: template.sellPrice,
    costPrice: template.costPrice,
    minQty: template.minQty,
    quantity: qty,
    expiryDate,
    notes: '',
  });
}

// ─── STORE MEMBERS ────────────────────────────────────────────────────────────

export async function getStoreRole(storeId: string): Promise<MemberRole | null> {
  if (!isSupabaseConfigured) return 'owner'; // local mode = full access
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('store_members').select('role')
    .eq('store_id', storeId).eq('user_id', user.id).single();
  return (data?.role as MemberRole) ?? null;
}

export async function getStoreMembers(storeId: string): Promise<StoreMember[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('store_members')
    .select('user_id, role')
    .eq('store_id', storeId);
  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Look up emails separately to avoid FK join schema cache issues
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', data.map(r => r.user_id));

  const emailMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.email]));

  return data.map(row => ({
    userId: row.user_id,
    email: emailMap[row.user_id] ?? '',
    role: row.role as MemberRole,
  }));
}

export async function removeMember(storeId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('store_members').delete().eq('store_id', storeId).eq('user_id', userId);
  if (error) throw error;
}

export async function changeMemberRole(storeId: string, userId: string, role: MemberRole): Promise<void> {
  const { error } = await supabase
    .from('store_members').update({ role }).eq('store_id', storeId).eq('user_id', userId);
  if (error) throw error;
}

// ─── INVITATIONS ──────────────────────────────────────────────────────────────

export async function getInvitations(storeId: string): Promise<StoreInvitation[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('store_invitations').select('*').eq('store_id', storeId);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id, invitedEmail: row.invited_email, role: row.role as MemberRole,
  }));
}

export async function inviteWorker(storeId: string, email: string, role: MemberRole = 'worker'): Promise<void> {
  // Check if already a member
  const { data: existing } = await supabase
    .from('profiles').select('id').eq('email', email).single();

  if (existing) {
    // User already exists — add directly
    const { error } = await supabase.from('store_members').insert({
      store_id: storeId, user_id: existing.id, role,
    });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    // Not yet registered — create invitation
    const { error } = await supabase.from('store_invitations').insert({
      store_id: storeId, invited_email: email, role,
    });
    if (error && !error.message.includes('duplicate')) throw error;
  }
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.from('store_invitations').delete().eq('id', invitationId);
  if (error) throw error;
}

// ─── SALES ────────────────────────────────────────────────────────────────────

const LS_SALES = 'pocket_scanner_sales';

export interface Sale {
  id: string;
  storeId: string;
  productId: string | null;
  productName: string;
  barcode: string;
  category: string;
  quantitySold: number;
  soldAt: string;
  sellPrice: number | null;
  revenue: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSale(row: any): Sale {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id ?? null,
    productName: row.product_name,
    barcode: row.barcode,
    category: row.category,
    quantitySold: row.quantity_sold,
    soldAt: row.sold_at,
    sellPrice: row.sell_price ?? null,
    revenue: row.revenue ?? null,
  };
}

export async function recordSale(sale: Omit<Sale, 'id' | 'soldAt'>): Promise<Sale> {
  if (!isSupabaseConfigured) {
    const all = lsGet<Sale>(LS_SALES);
    const newSale: Sale = { ...sale, id: generateId(), soldAt: new Date().toISOString(), sellPrice: sale.sellPrice ?? null, revenue: sale.revenue ?? null };
    lsSet(LS_SALES, [newSale, ...all]);
    return newSale;
  }
  const { data, error } = await supabase.from('sales').insert({
    store_id: sale.storeId,
    product_id: sale.productId,
    product_name: sale.productName,
    barcode: sale.barcode,
    category: sale.category,
    quantity_sold: sale.quantitySold,
    sell_price: sale.sellPrice ?? null,
    revenue: sale.revenue ?? null,
  }).select().single();
  if (error) throw error;
  return rowToSale(data);
}

export async function getSalesByStore(storeId: string): Promise<Sale[]> {
  if (!isSupabaseConfigured) {
    return lsGet<Sale>(LS_SALES).filter(s => s.storeId === storeId);
  }
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .eq('store_id', storeId)
    .order('sold_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToSale);
}

export async function deleteSale(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    lsSet(LS_SALES, lsGet<Sale>(LS_SALES).filter(s => s.id !== id));
    return;
  }
  const { error } = await supabase.from('sales').delete().eq('id', id);
  if (error) throw error;
}

// ─── BARCODE CACHE ────────────────────────────────────────────────────────────

const LS_BARCODE_CACHE = 'pocket_scanner_barcode_cache';

export async function getCachedBarcode(barcode: string): Promise<{ name: string; category: string } | null> {
  if (!isSupabaseConfigured) {
    try {
      const cache = JSON.parse(localStorage.getItem(LS_BARCODE_CACHE) || '{}');
      return cache[barcode] ?? null;
    } catch { return null; }
  }
  const { data } = await supabase
    .from('barcode_cache').select('name, category').eq('barcode', barcode).maybeSingle();
  return data ? { name: data.name, category: data.category } : null;
}

export async function setCachedBarcode(barcode: string, name: string, category: string): Promise<void> {
  if (!barcode.trim() || !name.trim()) return;
  if (!isSupabaseConfigured) {
    try {
      const cache = JSON.parse(localStorage.getItem(LS_BARCODE_CACHE) || '{}');
      cache[barcode] = { name, category };
      localStorage.setItem(LS_BARCODE_CACHE, JSON.stringify(cache));
    } catch {}
    return;
  }
  await supabase.from('barcode_cache')
    .upsert({ barcode, name, category }, { onConflict: 'barcode' });
}
