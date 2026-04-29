import { errMsg } from '../utils/errMsg';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ScanLine, Camera, CameraOff, CheckCircle, Save, Loader2, Clock, Sparkles, PackagePlus, RotateCcw } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { getStores, getProductsByStore, saveProduct, updateProduct, receiveStock, setCachedBarcode } from '../utils/storage';
import { uploadProductImage } from '../utils/productImage';
import { lookupBarcode } from '../utils/barcodeApi';
import { useSettings } from '../contexts/SettingsContext';
import { t } from '../i18n';
import type { Store, Product } from '../types';

const CATEGORIES = ['Food', 'Beverage', 'Dairy', 'Produce', 'Bakery', 'Frozen', 'Snacks', 'Personal Care', 'Cleaning', 'Other'];
const UNITS = ['pcs', 'box', 'pack', 'kg', 'g', 'L', 'mL', 'bottle', 'can', 'bag'];

const EMPTY_FORM = {
  barcode: '', name: '', category: 'Food', quantity: '1',
  unit: 'pcs', expiryDate: '', notes: '',
  costPrice: '', sellPrice: '', minQty: '', supplier: '',
};

type Mode = 'add' | 'receive';

export default function ScanPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const { lang, defaultUnit } = useSettings();
  const tr = (key: Parameters<typeof t>[1]) => t(lang, key);
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
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, unit: defaultUnit }));
  const [autoFilled, setAutoFilled] = useState(false);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [receiveBarcode, setReceiveBarcode] = useState('');
  const [receiveProduct, setReceiveProduct] = useState<Product | null>(null);
  const [receiveQty, setReceiveQty] = useState('1');
  const [receiveExpiry, setReceiveExpiry] = useState('');
  const [receiveLookupDone, setReceiveLookupDone] = useState(false);
  const receiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [existingMatches, setExistingMatches] = useState<Product[]>([]);
  const existingCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPromptVisible, setPhotoPromptVisible] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!storeId) return;
    Promise.all([getStores(), getProductsByStore(storeId)]).then(([stores, products]) => {
      setStore(stores.find(s => s.id === storeId) || null);
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
    setExistingMatches([]);
    triggerLookup(value);

    if (existingCheckTimer.current) clearTimeout(existingCheckTimer.current);
    if (!value.trim() || !storeId) return;
    existingCheckTimer.current = setTimeout(async () => {
      const prods = await getProductsByStore(storeId);
      setExistingMatches(prods.filter(p => p.barcode === value.trim()));
    }, 600);
  }

  function switchToReceive() {
    const barcode = form.barcode;
    setExistingMatches([]);
    setMode('receive');
    setReceiveBarcode(barcode);
    handleReceiveBarcodeChange(barcode);
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
      try {
        await scannerRef.current.stop();
      } catch {
        // Scanner may already be stopped during teardown.
      }
      scannerStarted.current = false;
    }
    setScanning(false);
  }

  function sanitizeNum(field: string, value: string): string {
    if (['quantity', 'minQty'].includes(field)) return value.replace(/[^0-9]/g, '');
    if (['costPrice', 'sellPrice'].includes(field)) {
      const clean = value.replace(/[^0-9.]/g, '');
      const parts = clean.split('.');
      return parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : clean;
    }
    return value;
  }

  function handleField(field: string, value: string) {
    if (field === 'barcode') { handleBarcodeChange(value); return; }
    if (field === 'name') setAutoFilled(false);
    setForm(prev => ({ ...prev, [field]: sanitizeNum(field, value) }));
  }

  function selectRecent(product: Product) {
    setForm({
      barcode: product.barcode, name: product.name, category: product.category,
      quantity: '1', unit: product.unit, expiryDate: '', notes: '',
      costPrice: product.costPrice != null ? String(product.costPrice) : '',
      sellPrice: product.sellPrice != null ? String(product.sellPrice) : '',
      minQty: product.minQty != null ? String(product.minQty) : '',
      supplier: product.supplier ?? '',
    });
    document.getElementById('scan-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  function hasInvalidNum(v: string) { return v !== '' && (isNaN(Number(v)) || Number(v) < 0); }

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
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  async function handleSave() {
    if (!storeId || !form.name.trim()) return;
    if (
      hasInvalidNum(form.quantity) || hasInvalidNum(form.costPrice) ||
      hasInvalidNum(form.sellPrice) || hasInvalidNum(form.minQty)
    ) { setError(tr('validationNumberInvalid')); return; }

    if (photoPromptVisible) return;
    setPhotoPromptVisible(true);
  }

  async function doSave() {
    if (!storeId || saving) return null;
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
        imageUrl: null,
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
      return savedProd;
    } catch (e) {
      setError(errMsg(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const b64 = await resizeImage(file);
      setPhotoBase64(b64);
    } catch {
      setError('Could not process photo');
    }
  }

  async function handlePhotoConfirm() {
    setPhotoUploading(true);
    try {
      const savedProd = await doSave();
      if (savedProd && photoBase64 && storeId) {
        try {
          const url = await uploadProductImage(storeId, savedProd.id, photoBase64);
          await updateProduct(savedProd.id, { imageUrl: url });
        } catch {
          setError('Photo upload failed — product saved without photo');
        }
      }
    } finally {
      setPhotoUploading(false);
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
          <h1>{tr('scanItemTitle')}</h1>
        </div>
        {store && <span className="store-badge">{store.name}</span>}
      </header>

      {saved && <div className="toast success"><CheckCircle size={18} /> {mode === 'receive' ? tr('stockReceivedToast') : tr('productSavedToast')}</div>}
      {scanSuccess && <div className="toast success"><CheckCircle size={18} /> {tr('scannedLabel')} {scannedCode}</div>}
      {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}

      <div className="mode-toggle-wrap">
        <div className="mode-toggle">
          <button className={`mode-btn ${mode === 'add' ? 'active' : ''}`} onClick={() => setMode('add')}>
            <PackagePlus size={15} /> {tr('addNewMode')}
          </button>
          <button className={`mode-btn ${mode === 'receive' ? 'active' : ''}`} onClick={() => setMode('receive')}>
            <RotateCcw size={15} /> {tr('receiveStockMode')}
          </button>
        </div>
      </div>

      <div className="scan-section">
        <div className="scanner-box">
          <div id="qr-reader" className={scanning ? 'visible' : 'hidden'} />
          {!scanning && (
            <div className="scanner-placeholder">
              <ScanLine size={48} strokeWidth={1} />
              <p>{tr('cameraNotActive')}</p>
            </div>
          )}
        </div>
        <div className="scanner-controls">
          <button className={scanning ? 'btn-secondary' : 'btn-primary'} onClick={scanning ? stopScanner : startScanner}>
            {scanning ? <><CameraOff size={16} /> {tr('stopCamera')}</> : <><Camera size={16} /> {tr('openCamera')}</>}
          </button>
        </div>
      </div>

      {mode === 'receive' && (
        <div className="form-section" id="scan-form">
          <h2>{tr('receiveStockTitle')}</h2>
          <div className="form-group">
            <label>{tr('barcodeLabel')}</label>
            <input value={receiveBarcode} onChange={e => handleReceiveBarcodeChange(e.target.value)} placeholder={tr('scanOrEnterBarcode')} />
          </div>
          {receiveProduct && (
            <>
              <div className="autofill-chip"><Sparkles size={13} /> {receiveProduct.name}</div>
              <div className="form-row">
                <div className="form-group">
                  <label>{tr('qtyToReceive')}</label>
                  <input type="text" inputMode="numeric" value={receiveQty} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v; setReceiveQty(v); }} />
                </div>
              </div>
              <div className="form-group">
                <label>{tr('expiryDateRequired')}</label>
                <input type="date" value={receiveExpiry} onChange={e => setReceiveExpiry(e.target.value)} />
              </div>
              <button className="btn-primary full-width" onClick={handleReceive} disabled={!receiveQty || !receiveExpiry || saving}>
                {saving ? <><Loader2 size={16} className="spin" /> {tr('savingLabel')}</> : <><CheckCircle size={16} /> {tr('receiveBtn')}</>}
              </button>
            </>
          )}
          {receiveLookupDone && !receiveProduct && (
            <div className="autofill-chip" style={{ background: 'var(--warn-light)', color: 'var(--warn)' }}>
              {tr('barcodeNotFound')}
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
              <p className="quick-select-label"><Clock size={13} /> {tr('barcodeHistory')}</p>
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
            <h2>{tr('itemDetails')}</h2>

            <div className="form-group">
              <label>{tr('barcodeLabel')}</label>
              <input value={form.barcode} onChange={e => handleField('barcode', e.target.value)} placeholder={tr('scanOrEnterManually')} />
            </div>

            {existingMatches.length > 0 && (
              <div className="existing-barcode-notice">
                <p>
                  <strong>{existingMatches[0].name}</strong> already exists with this barcode
                  {existingMatches.length > 1 ? ` (${existingMatches.length} batches)` : ''}.
                </p>
                <div className="existing-barcode-actions">
                  <button type="button" className="btn-primary" onClick={switchToReceive}>
                    <RotateCcw size={14} /> Receive Stock
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setExistingMatches([])}>
                    Add New Batch
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>{tr('productNameLabel')} *</label>
              <input value={form.name} onChange={e => handleField('name', e.target.value)} placeholder="e.g. Whole Milk 1L" />
              {autoFilled && <div className="autofill-chip"><Sparkles size={13} /> {tr('autoFilledFromDb')}</div>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{tr('categoryLabel')}</label>
                <select value={form.category} onChange={e => handleField('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group form-group-sm">
                <label>{tr('qtyLabel')}</label>
                <input type="text" inputMode="numeric" value={form.quantity} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v; handleField('quantity', v); }} />
              </div>
              <div className="form-group form-group-sm">
                <label>{tr('unitLabel')}</label>
                <select value={form.unit} onChange={e => handleField('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>{tr('expiryDateLabel')}</label>
              <input type="date" value={form.expiryDate} onChange={e => handleField('expiryDate', e.target.value)} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{tr('costPriceLabel')}</label>
                <input type="text" inputMode="decimal" value={form.costPrice} onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); e.target.value = v; handleField('costPrice', v); }} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>{tr('sellPriceLabel')}</label>
                <input type="text" inputMode="decimal" value={form.sellPrice} onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); e.target.value = v; handleField('sellPrice', v); }} placeholder="0.00" />
              </div>
            </div>

            <div className="form-group form-group-sm">
              <label>{tr('minStockQtyLabel')}</label>
              <input type="text" inputMode="numeric" value={form.minQty} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v; handleField('minQty', v); }} placeholder="e.g. 5" />
            </div>

            <div className="form-group">
              <label>{tr('sectionNotes')}</label>
              <textarea value={form.notes} onChange={e => handleField('notes', e.target.value)} placeholder={tr('optionalNotes')} rows={2} />
            </div>

            <div className="form-group">
              <label>{tr('supplierLabel')}</label>
              <input value={form.supplier} onChange={e => handleField('supplier', e.target.value)} placeholder="e.g. ABC Distributors" />
            </div>

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
            <button className="btn-primary full-width" onClick={handleSave} disabled={!form.name.trim() || saving}>
              {saving ? <><Loader2 size={16} className="spin" /> {tr('savingLabel')}</> : <><Save size={18} /> {tr('saveAndScanNext')}</>}
            </button>
            <button className="btn-secondary full-width" style={{ marginTop: '8px' }}
              onClick={() => { stopScanner(); navigate(`/store/${storeId}`); }}>
              {tr('doneBtn')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
