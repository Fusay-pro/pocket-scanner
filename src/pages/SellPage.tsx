import { errMsg } from '../utils/errMsg';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ScanLine, Camera, CameraOff, CheckCircle, ShoppingCart,
  Search, Minus, Plus, Trash2, Loader2, Package
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { getStores, getProductsByStore, updateProduct, recordSale } from '../utils/storage';
import StoreTabBar from '../components/StoreTabBar';
import type { Store, Product } from '../types';

interface CartItem {
  product: Product;
  qty: number;
}

export default function SellPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();

  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerStarted = useRef(false);

  useEffect(() => {
    if (!storeId) return;
    Promise.all([getStores(), getProductsByStore(storeId)]).then(([stores, prods]) => {
      setStore(stores.find(s => s.id === storeId) || null);
      setProducts(prods);
    });
    return () => { stopScanner(); };
  }, [storeId]);

  // ── Scanner ──────────────────────────────────────────────────
  async function startScanner() {
    if (scannerStarted.current) return;
    try {
      const scanner = new Html5Qrcode('sell-qr-reader');
      scannerRef.current = scanner;
      scannerStarted.current = true;
      setScanning(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 120 } },
        (code) => {
          // FEFO: among batches with the same barcode, sell the soonest-expiring one first
          const matches = products.filter(p => p.barcode === code && p.quantity > 0);
          matches.sort((a, b) => {
            if (!a.expiryDate && !b.expiryDate) return 0;
            if (!a.expiryDate) return 1;
            if (!b.expiryDate) return -1;
            return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
          });
          const found = matches[0];
          if (found) addToCart(found);
          else {
            const outOfStock = products.some(p => p.barcode === code);
            setError(outOfStock ? `All batches of this product are out of stock.` : `No product found for barcode: ${code}`);
          }
          stopScanner();
        },
        () => {}
      );
    } catch {
      setScanning(false);
      scannerStarted.current = false;
      setError('Camera not available.');
    }
  }

  async function stopScanner() {
    if (scannerRef.current && scannerStarted.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerStarted.current = false;
    }
    setScanning(false);
  }

  // ── Cart ─────────────────────────────────────────────────────
  function addToCart(product: Product) {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i => i.product.id === product.id
          ? { ...i, qty: Math.min(i.qty + 1, i.product.quantity) }
          : i);
      }
      return [...prev, { product, qty: 1 }];
    });
    setSearch('');
  }

  function updateQty(productId: string, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.product.id !== productId) return i;
      const newQty = i.qty + delta;
      if (newQty <= 0) return i; // use remove instead
      if (newQty > i.product.quantity) return i;
      return { ...i, qty: newQty };
    }));
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  }

  // ── Checkout ─────────────────────────────────────────────────
  async function handleSell() {
    if (!storeId || cart.length === 0) return;
    setProcessing(true);
    try {
      await Promise.all(cart.map(async item => {
        // Deduct stock
        await updateProduct(item.product.id, {
          quantity: Math.max(0, item.product.quantity - item.qty),
        });
        // Record sale with price snapshot
        const sp = item.product.sellPrice ?? null;
        await recordSale({
          storeId: storeId!,
          productId: item.product.id,
          productName: item.product.name,
          barcode: item.product.barcode,
          category: item.product.category,
          quantitySold: item.qty,
          sellPrice: sp,
          revenue: sp != null ? sp * item.qty : null,
        });
      }));
      // Refresh local product list
      const fresh = await getProductsByStore(storeId);
      setProducts(fresh);
      setCart([]);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setProcessing(false);
    }
  }

  // ── Search results ───────────────────────────────────────────
  const searchResults = search.length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.includes(search)
      ).slice(0, 6)
    : [];

  const cartTotal = cart.reduce((sum, i) => sum + i.qty, 0);
  const cartRevenue = cart.reduce((sum, i) => {
    const sp = i.product.sellPrice;
    return sp != null ? sum + sp * i.qty : sum;
  }, 0);

  return (
    <div className="page sell-page">
      <header className="page-header">
        <button className="btn-icon" onClick={() => navigate('/')}><ArrowLeft size={20} /></button>
        <div className="header-title flex-1">
          <ShoppingCart size={20} />
          <h1>Sell</h1>
        </div>
        {store && <span className="store-badge">{store.name}</span>}
      </header>

      {done && <div className="toast success"><CheckCircle size={18} /> Sale recorded!</div>}
      {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}

      {/* Scanner */}
      <div className="scan-section">
        <div className="scanner-box scanner-box-sm">
          <div id="sell-qr-reader" className={scanning ? 'visible' : 'hidden'} />
          {!scanning && (
            <div className="scanner-placeholder">
              <ScanLine size={36} strokeWidth={1} />
              <p>Scan barcode to add item</p>
            </div>
          )}
        </div>
        <div className="scanner-controls">
          <button className={scanning ? 'btn-secondary' : 'btn-primary'} onClick={scanning ? stopScanner : startScanner}>
            {scanning ? <><CameraOff size={16} /> Stop</> : <><Camera size={16} /> Scan Barcode</>}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="sell-search-wrap">
        <div className="search-box">
          <Search size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product by name…"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="search-dropdown">
            {searchResults.map(p => (
              <button key={p.id} className="search-result-item" onClick={() => addToCart(p)}>
                <div className="search-result-name">{p.name}</div>
                <div className="search-result-meta">
                  <span>{p.category}</span>
                  <span>Stock: {p.quantity} {p.unit}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="cart-section">
        <div className="cart-header">
          <h2>Cart {cartTotal > 0 && <span className="cart-count">{cartTotal}</span>}</h2>
        </div>

        {cart.length === 0 ? (
          <div className="cart-empty">
            <Package size={32} strokeWidth={1} />
            <p>No items yet. Scan or search a product.</p>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {cart.map(item => (
                <div key={item.product.id} className="cart-item">
                  <div className="cart-item-info">
                    <p className="cart-item-name">{item.product.name}</p>
                    <p className="cart-item-meta">{item.product.category} · Stock: {item.product.quantity}</p>
                  </div>
                  <div className="cart-qty-controls">
                    <button className="qty-btn" onClick={() => updateQty(item.product.id, -1)} disabled={item.qty <= 1}>
                      <Minus size={14} />
                    </button>
                    <span className="qty-value">{item.qty}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.product.id, 1)} disabled={item.qty >= item.product.quantity}>
                      <Plus size={14} />
                    </button>
                    <button className="qty-btn qty-btn-danger" onClick={() => removeFromCart(item.product.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-summary">
              <span>
                {cart.length} product{cart.length !== 1 ? 's' : ''} · {cartTotal} unit{cartTotal !== 1 ? 's' : ''}
                {cartRevenue > 0 && <> · <strong>฿{cartRevenue.toFixed(2)}</strong></>}
              </span>
              <button className="btn-primary sell-confirm-btn" onClick={handleSell} disabled={processing}>
                {processing
                  ? <><Loader2 size={16} className="spin" /> Processing…</>
                  : <><CheckCircle size={16} /> Confirm Sale</>}
              </button>
            </div>
          </>
        )}
      </div>

      <StoreTabBar storeId={storeId!} />
    </div>
  );
}
