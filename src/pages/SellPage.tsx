import { errMsg } from '../utils/errMsg';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ScanLine, Camera, CameraOff, CheckCircle, ShoppingCart,
  Search, Minus, Plus, Trash2, Loader2, Package
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { getStores, getProductsByStore, updateProduct, recordSale } from '../utils/storage';
import { useSettings } from '../contexts/SettingsContext';
import { t } from '../i18n';
import StoreTabBar from '../components/StoreTabBar';
import BatchPickerModal from '../components/BatchPickerModal';
import type { Store, Product } from '../types';
import { formatDate } from '../types';

interface CartItem {
  product: Product;
  qty: number;
}

export default function SellPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const { lang, currencySymbol, lowStockThreshold } = useSettings();
  const tr = (key: Parameters<typeof t>[1]) => t(lang, key);

  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [lowStockNames, setLowStockNames] = useState<string[]>([]);
  const [batchPickerBatches, setBatchPickerBatches] = useState<Product[]>([]);

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
          if (found) handleProductSelect(found);
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
      try {
        await scannerRef.current.stop();
      } catch {
        // Scanner may already be stopped during teardown.
      }
      scannerStarted.current = false;
    }
    setScanning(false);
  }

  // ── Cart ─────────────────────────────────────────────────────
  function addToCart(product: Product) {
    if (product.quantity <= 0) {
      setError(`${product.name} is out of stock.`);
      return;
    }

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

  function handleProductSelect(product: Product) {
    const batches = products.filter(p => p.barcode === product.barcode && p.quantity > 0);
    if (batches.length === 0) {
      setError(`All batches of ${product.name} are out of stock.`);
      return;
    }
    if (batches.length > 1) {
      setBatchPickerBatches(batches);
    } else {
      addToCart(batches[0]);
    }
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
      const freshProducts = await getProductsByStore(storeId);
      const freshById = new Map(freshProducts.map(product => [product.id, product]));

      for (const item of cart) {
        const latest = freshById.get(item.product.id);
        if (!latest || latest.quantity < item.qty) {
          throw new Error(`Not enough stock for ${item.product.name}. Refresh and try again.`);
        }
      }

      await Promise.all(cart.map(async item => {
        const latest = freshById.get(item.product.id)!;
        // Deduct stock
        await updateProduct(item.product.id, {
          quantity: Math.max(0, latest.quantity - item.qty),
        });
        // Record sale with price snapshot
        const sp = latest.sellPrice ?? null;
        await recordSale({
          storeId: storeId!,
          productId: item.product.id,
          productName: latest.name,
          barcode: latest.barcode,
          category: latest.category,
          quantitySold: item.qty,
          sellPrice: sp,
          revenue: sp != null ? sp * item.qty : null,
        });
      }));
      // Refresh local product list
      const fresh = await getProductsByStore(storeId);
      setProducts(fresh);
      const nowLow = cart
        .map(item => fresh.find(p => p.id === item.product.id))
        .filter((p): p is NonNullable<typeof p> =>
          p !== undefined && p.quantity <= (p.minQty ?? lowStockThreshold)
        )
        .map(p => p.name);
      if (nowLow.length > 0) {
        setLowStockNames(nowLow);
        setTimeout(() => setLowStockNames([]), 4000);
      }
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
        p.quantity > 0 && (
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.barcode.includes(search)
        )
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
          <h1>{tr('sellTitle')}</h1>
        </div>
        {store && <span className="store-badge">{store.name}</span>}
      </header>

      {done && <div className="toast success"><CheckCircle size={18} /> {tr('saleRecorded')}</div>}
      {lowStockNames.length > 0 && (
        <div className="toast warning">
          ⚠️ Low stock: {lowStockNames.join(', ')}
        </div>
      )}
      {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}

      {/* Scanner */}
      <div className="scan-section">
        <div className="scanner-box scanner-box-sm">
          <div id="sell-qr-reader" className={scanning ? 'visible' : 'hidden'} />
          {!scanning && (
            <div className="scanner-placeholder">
              <ScanLine size={36} strokeWidth={1} />
              <p>{tr('scanBarcodeToAdd')}</p>
            </div>
          )}
        </div>
        <div className="scanner-controls">
          <button className={scanning ? 'btn-secondary' : 'btn-primary'} onClick={scanning ? stopScanner : startScanner}>
            {scanning ? <><CameraOff size={16} /> {tr('stopBtn')}</> : <><Camera size={16} /> {tr('scanBarcode')}</>}
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
            placeholder={tr('searchProductName')}
          />
        </div>
        {searchResults.length > 0 && (
          <div className="search-dropdown">
            {searchResults.map(p => (
              <button key={p.id} className="search-result-item" onClick={() => { handleProductSelect(p); stopScanner(); }}>
                <div className="search-result-name">{p.name}</div>
                <div className="search-result-meta">
                  <span>{p.category}</span>
                  <span>{tr('stockLabel')} {p.quantity} {p.unit}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="cart-section">
        <div className="cart-header">
          <h2>{tr('cartTitle')} {cartTotal > 0 && <span className="cart-count">{cartTotal}</span>}</h2>
        </div>

        {cart.length === 0 ? (
          <div className="cart-empty">
            <Package size={32} strokeWidth={1} />
            <p>{tr('cartEmpty')}</p>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {cart.map(item => (
                <div key={item.product.id} className="cart-item">
                  {item.product.imageUrl ? (
                    <img src={item.product.imageUrl} className="sell-thumb" alt="" />
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
                {cartRevenue > 0 && <> · <strong>{currencySymbol}{cartRevenue.toFixed(2)}</strong></>}
              </span>
              <button className="btn-primary sell-confirm-btn" onClick={handleSell} disabled={processing}>
                {processing
                  ? <><Loader2 size={16} className="spin" /> {tr('processingLabel')}</>
                  : <><CheckCircle size={16} /> {tr('confirmSale')}</>}
              </button>
            </div>
          </>
        )}
      </div>

      {batchPickerBatches.length > 0 && (
        <BatchPickerModal
          batches={batchPickerBatches}
          onSelect={p => { addToCart(p); setBatchPickerBatches([]); }}
          onClose={() => setBatchPickerBatches([])}
        />
      )}

      <StoreTabBar storeId={storeId!} />
    </div>
  );
}
