import { errMsg } from '../utils/errMsg';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ScanLine, Camera, CameraOff, CheckCircle, Save, Loader2, Clock, Sparkles, PackagePlus, RotateCcw } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { getStores, getProductsByStore, saveProduct, receiveStock, setCachedBarcode } from '../utils/storage';
import { lookupBarcode } from '../utils/barcodeApi';
import type { Store, Product } from '../types';

const CATEGORIES = ['Food', 'Beverage', 'Dairy', 'Produce', 'Bakery', 'Frozen', 'Snacks', 'Personal Care', 'Cleaning', 'Other'];
const UNITS = ['pcs', 'box', 'pack', 'kg', 'g', 'L', 'mL', 'bottle', 'can', 'bag'];

const EMPTY_FORM = {
  barcode: '', name: '', category: 'Food', quantity: '1',
  unit: 'pcs', expiryDate: '', notes: '',
  costPrice: '', sellPrice: '', minQty: '',
};

type Mode = 'add' | 'receive';

export default function ScanPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const [store, setStore] = useState<Store | null>(null);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerStarted = useRef(false);

  const [mode, setMode] = useState<Mode>('add');
  const [form, setForm] = useState(EMPTY_FORM);
  const [autoFilled, setAutoFilled] = useState(false);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [receiveBarcode, setReceiveBarcode] = useState('');
  const [receiveProduct, setReceiveProduct] = useState<Product | null>(null);
  const [receiveQty, setReceiveQty] = useState('1');
  const [receiveExpiry, setReceiveExpiry] = useState('');
  const [receiveLookupDone, setReceiveLookupDone] = useState(false);
  const receiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!storeId) return;
    Promise.all([getStores(), getProductsByStore(storeId)]).then(([stores, products]) => {
      setStore(stores.find(s => s.id === storeId) || null);
      // 4 most recently added products, sorted by addedAt desc
      const recent = [...products]
        .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
        .slice(0, 4);
      setRecentProducts(recent);
    });
    return () => { stopScanner(); };
  }, [storeId]);

  function triggerLookup(value: string) {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    if (!value.trim()) return;
    lookupTimerRef.current = setTimeout(async () => {
      const result = await lookupBarcode(value.trim());
      if (result) {
        setForm(prev => ({ ...prev, name: result.name, category: result.category }));
        setAutoFilled(true);
      }
    }, 600);
  }

  function handleBarcodeChange(value: string) {
    setForm(prev => ({ ...prev, barcode: value }));
    setAutoFilled(false);
    triggerLookup(value);
  }

  function handleReceiveBarcodeChange(value: string) {
    setReceiveBarcode(value);
    setReceiveProduct(null);
    setReceiveLookupDone(false);
    if (receiveTimerRef.current) clearTimeout(receiveTimerRef.current);
    if (!value.trim() || !storeId) return;
    receiveTimerRef.current = setTimeout(async () => {
      const prods = await getProductsByStore(storeId);
      const matches = prods.filter(p => p.barcode === value.trim());
      if (matches.length > 0) {
        setReceiveProduct(matches[0]);
        setReceiveLookupDone(true);
      } else {
        setReceiveLookupDone(true);
        setMode('add');
        setForm(prev => ({ ...prev, barcode: value.trim() }));
        triggerLookup(value.trim());
      }
    }, 600);
  }

  async function startScanner() {
    if (scannerStarted.current) return;
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      scannerStarted.current = true;
      setScanning(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          if (mode === 'receive') {
            handleReceiveBarcodeChange(decodedText);
          } else {
            handleBarcodeChange(decodedText);
            setScannedCode(decodedText);
            setScanSuccess(true);
            setTimeout(() => setScanSuccess(false), 3000);
          }
          stopScanner();
        },
        () => {}
      );
    } catch {
      setScanning(false);
      scannerStarted.current = false;
      setError('Camera not available. Enter barcode manually.');
    }
  }

  async function stopScanner() {
    if (scannerRef.current && scannerStarted.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerStarted.current = false;
    }
    setScanning(false);
  }

  function handleField(field: string, value: string) {
    if (field === 'barcode') { handleBarcodeChange(value); return; }
    if (field === 'name') setAutoFilled(false);
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function selectRecent(product: Product) {
    setForm({
      barcode: product.barcode, name: product.name, category: product.category,
      quantity: '1', unit: product.unit, expiryDate: '', notes: '',
      costPrice: product.costPrice != null ? String(product.costPrice) : '',
      sellPrice: product.sellPrice != null ? String(product.sellPrice) : '',
      minQty: product.minQty != null ? String(product.minQty) : '',
    });
    document.getElementById('scan-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleSave() {
    if (!storeId || !form.name.trim()) return;
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
      });
      setRecentProducts(prev => [savedProd, ...prev].slice(0, 4));
      // Cache barcode → name so future scans auto-fill instantly
      if (form.barcode.trim()) {
        setCachedBarcode(form.barcode.trim(), form.name.trim(), form.category).catch(() => {});
      }
      setSaved(true);
      setForm(EMPTY_FORM);
      setScannedCode('');
      setAutoFilled(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleReceive() {
    if (!storeId || !receiveProduct || !receiveQty || !receiveExpiry) return;
    setSaving(true);
    try {
      await receiveStock(storeId, receiveBarcode.trim(), Number(receiveQty) || 1, receiveExpiry);
      setSaved(true);
      setReceiveBarcode('');
      setReceiveProduct(null);
      setReceiveQty('1');
      setReceiveExpiry('');
      setReceiveLookupDone(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-icon" onClick={() => { stopScanner(); navigate(`/store/${storeId}`); }}>
          <ArrowLeft size={20} />
        </button>
        <div className="header-title">
          <ScanLine size={20} />
          <h1>Scan Item</h1>
        </div>
        {store && <span className="store-badge">{store.name}</span>}
      </header>

      {saved && <div className="toast success"><CheckCircle size={18} /> {mode === 'receive' ? 'Stock received!' : 'Product saved!'}</div>}
      {scanSuccess && <div className="toast success"><CheckCircle size={18} /> Scanned: {scannedCode}</div>}
      {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}

      <div className="mode-toggle-wrap">
        <div className="mode-toggle">
          <button className={`mode-btn ${mode === 'add' ? 'active' : ''}`} onClick={() => setMode('add')}>
            <PackagePlus size={15} /> Add New
          </button>
          <button className={`mode-btn ${mode === 'receive' ? 'active' : ''}`} onClick={() => setMode('receive')}>
            <RotateCcw size={15} /> Receive Stock
          </button>
        </div>
      </div>

      <div className="scan-section">
        <div className="scanner-box">
          <div id="qr-reader" className={scanning ? 'visible' : 'hidden'} />
          {!scanning && (
            <div className="scanner-placeholder">
              <ScanLine size={48} strokeWidth={1} />
              <p>Camera not active</p>
            </div>
          )}
        </div>
        <div className="scanner-controls">
          <button className={scanning ? 'btn-secondary' : 'btn-primary'} onClick={scanning ? stopScanner : startScanner}>
            {scanning ? <><CameraOff size={16} /> Stop Camera</> : <><Camera size={16} /> Open Camera</>}
          </button>
        </div>
      </div>

      {mode === 'receive' && (
        <div className="form-section" id="scan-form">
          <h2>Receive Stock</h2>
          <div className="form-group">
            <label>Barcode</label>
            <input value={receiveBarcode} onChange={e => handleReceiveBarcodeChange(e.target.value)} placeholder="Scan or enter barcode" />
          </div>
          {receiveProduct && (
            <>
              <div className="autofill-chip"><Sparkles size={13} /> {receiveProduct.name}</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Qty to Receive</label>
                  <input type="number" min="1" value={receiveQty} onChange={e => setReceiveQty(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Expiry Date *</label>
                <input type="date" value={receiveExpiry} onChange={e => setReceiveExpiry(e.target.value)} />
              </div>
              <button className="btn-primary full-width" onClick={handleReceive} disabled={!receiveQty || !receiveExpiry || saving}>
                {saving ? <><Loader2 size={16} className="spin" /> Saving…</> : <><CheckCircle size={16} /> Receive</>}
              </button>
            </>
          )}
          {receiveLookupDone && !receiveProduct && (
            <div className="autofill-chip" style={{ background: 'var(--warn-light)', color: 'var(--warn)' }}>
              Barcode not found — switching to Add New…
            </div>
          )}
          <button className="btn-secondary full-width" style={{ marginTop: '8px' }} onClick={() => { stopScanner(); navigate(`/store/${storeId}`); }}>
            Done
          </button>
        </div>
      )}

      {mode === 'add' && (
        <>
          {recentProducts.length > 0 && (
            <div className="quick-select-section">
              <p className="quick-select-label"><Clock size={13} /> Recently added</p>
              <div className="quick-select-grid">
                {recentProducts.map(p => (
                  <button key={p.id} className="quick-select-chip" onClick={() => selectRecent(p)}>
                    <span className="chip-name">{p.name}</span>
                    <span className="chip-meta">{p.category}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="form-section" id="scan-form">
            <h2>Item Details</h2>

            <div className="form-group">
              <label>Barcode</label>
              <input value={form.barcode} onChange={e => handleField('barcode', e.target.value)} placeholder="Scan or enter manually" />
            </div>

            <div className="form-group">
              <label>Product Name *</label>
              <input value={form.name} onChange={e => handleField('name', e.target.value)} placeholder="e.g. Whole Milk 1L" />
              {autoFilled && <div className="autofill-chip"><Sparkles size={13} /> Auto-filled from database</div>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={e => handleField('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group form-group-sm">
                <label>Qty</label>
                <input type="number" min="0" value={form.quantity} onChange={e => handleField('quantity', e.target.value)} />
              </div>
              <div className="form-group form-group-sm">
                <label>Unit</label>
                <select value={form.unit} onChange={e => handleField('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Expiry Date</label>
              <input type="date" value={form.expiryDate} onChange={e => handleField('expiryDate', e.target.value)} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Cost Price (฿)</label>
                <input type="number" min="0" step="0.01" value={form.costPrice} onChange={e => handleField('costPrice', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Sell Price (฿)</label>
                <input type="number" min="0" step="0.01" value={form.sellPrice} onChange={e => handleField('sellPrice', e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div className="form-group form-group-sm">
              <label>Min Stock Qty</label>
              <input type="number" min="0" value={form.minQty} onChange={e => handleField('minQty', e.target.value)} placeholder="e.g. 5" />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => handleField('notes', e.target.value)} placeholder="Optional notes…" rows={2} />
            </div>

            <button className="btn-primary full-width" onClick={handleSave} disabled={!form.name.trim() || saving}>
              {saving ? <><Loader2 size={16} className="spin" /> Saving…</> : <><Save size={18} /> Save & Scan Next</>}
            </button>
            <button className="btn-secondary full-width" style={{ marginTop: '8px' }}
              onClick={() => { stopScanner(); navigate(`/store/${storeId}`); }}>
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
