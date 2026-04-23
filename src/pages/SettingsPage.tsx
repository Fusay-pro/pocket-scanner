import { errMsg } from '../utils/errMsg';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Globe, Sun, Moon, BarChart2, Trash2,
  AlertTriangle, CheckCircle, Loader2, Shield, TrendingDown,
  MapPin, Download, Upload
} from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { getStoreRole, deleteAllProductsByStore, getStores, updateStore, getAllProducts, getAllSales, saveProduct } from '../utils/storage';
import { exportInventoryCsv, exportSalesCsv, parseInventoryCsv } from '../utils/csvExport';
import { t } from '../i18n';
import { isSupabaseConfigured } from '../lib/supabase';
import StoreTabBar from '../components/StoreTabBar';
import type { MemberRole } from '../utils/storage';
import type { Store } from '../types';

const GROUP_HEADER: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--text-muted)',
  padding: '20px 0 6px', marginTop: '4px',
};

export default function SettingsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const {
    lang, theme, analyticsRange, lowStockThreshold,
    currencySymbol, expiryWarningDays, defaultUnit,
    setLang, setTheme, setAnalyticsRange, setLowStockThreshold,
    setCurrencySymbol, setExpiryWarningDays, setDefaultUnit,
  } = useSettings();

  const [role, setRole] = useState<MemberRole | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [savingStore, setSavingStore] = useState(false);
  const [storeInfoSavedToast, setStoreInfoSavedToast] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importToast, setImportToast] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const isOwner = !isSupabaseConfigured || role === 'owner';

  useEffect(() => {
    if (!storeId) return;
    getStoreRole(storeId).then(setRole);
    getStores().then(stores => {
      const store = stores.find((s: Store) => s.id === storeId);
      if (store) { setStoreName(store.name); setStoreLocation(store.location ?? ''); }
    });
  }, [storeId]);

  async function handleDeleteAll() {
    if (!storeId || confirmText !== 'DELETE') return;
    setDeleting(true); setError('');
    try {
      await deleteAllProductsByStore(storeId);
      setDeleted(true); setConfirmText('');
      setTimeout(() => setDeleted(false), 3000);
    } catch (e) { setError(errMsg(e)); }
    finally { setDeleting(false); }
  }

  async function handleSaveStoreInfo() {
    if (!storeId) return;
    setSavingStore(true); setError('');
    try {
      await updateStore(storeId, { name: storeName, location: storeLocation });
      setStoreInfoSavedToast(true);
      setTimeout(() => setStoreInfoSavedToast(false), 3000);
    } catch (e) { setError(errMsg(e)); }
    finally { setSavingStore(false); }
  }

  async function handleExportInventory() {
    try {
      const [stores, products] = await Promise.all([getStores(), getAllProducts()]);
      exportInventoryCsv(stores, products);
    } catch (e) { setError(errMsg(e)); }
  }

  async function handleExportSales() {
    try {
      const [stores, sales] = await Promise.all([getStores(), getAllSales()]);
      exportSalesCsv(stores, sales);
    } catch (e) { setError(errMsg(e)); }
  }

  async function handleImportInventory(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const text = await file.text();
      const stores = await getStores();
      const storeMap = Object.fromEntries(stores.map(s => [s.id, s.name]));
      const products = parseInventoryCsv(text, storeMap);
      await Promise.all(products.map(p => saveProduct(p)));
      setImportToast(`Imported ${products.length} products`);
      setTimeout(() => setImportToast(''), 3000);
    } catch (e) { setError(errMsg(e)); }
    finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  }

  const tr = (key: Parameters<typeof t>[1]) => t(lang, key);

  return (
    <div className="page settings-page">
      <header className="page-header">
        <button className="btn-icon" onClick={() => navigate(`/store/${storeId}`)}>
          <ArrowLeft size={20} />
        </button>
        <div className="header-title flex-1">
          <h1>{tr('settingsTitle')}</h1>
        </div>
      </header>

      {deleted && <div className="toast success"><CheckCircle size={18} /> {tr('deleted')}</div>}
      {storeInfoSavedToast && <div className="toast success"><CheckCircle size={18} /> {tr('storeInfoSaved')}</div>}
      {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}

      <div className="settings-body">

        <div style={GROUP_HEADER}>{tr('sectionAppSettings')}</div>

        {/* ── Language ── */}
        <div className="settings-section">
          <div className="settings-section-label"><Globe size={13} /> {tr('sectionLanguage')}</div>
          <div className="settings-card">
            <button className={`settings-option ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>
              <span className="settings-option-flag">🇺🇸</span>
              <span className="settings-option-label">{tr('langEnglish')}</span>
              {lang === 'en' && <CheckCircle size={16} className="settings-check" />}
            </button>
            <div className="settings-divider" />
            <button className={`settings-option ${lang === 'th' ? 'active' : ''}`} onClick={() => setLang('th')}>
              <span className="settings-option-flag">🇹🇭</span>
              <span className="settings-option-label">{tr('langThai')}</span>
              {lang === 'th' && <CheckCircle size={16} className="settings-check" />}
            </button>
          </div>
        </div>

        {/* ── Appearance ── */}
        <div className="settings-section">
          <div className="settings-section-label"><Sun size={13} /> {tr('sectionAppearance')}</div>
          <div className="settings-card settings-card-row">
            <button className={`settings-theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
              <Sun size={20} /><span>{tr('themeLight')}</span>
            </button>
            <button className={`settings-theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
              <Moon size={20} /><span>{tr('themeDark')}</span>
            </button>
          </div>
        </div>

        <div style={GROUP_HEADER}>{tr('sectionStoreSettings')}</div>

        {/* ── Analytics ── */}
        <div className="settings-section">
          <div className="settings-section-label"><BarChart2 size={13} /> {tr('sectionAnalytics')}</div>
          <div className="settings-card">
            <div className="settings-row-label">{tr('analyticsDefaultRange')}</div>
            <div className="settings-segment">
              {(['7d', '30d', 'all'] as const).map(r => (
                <button key={r} className={`settings-segment-btn ${analyticsRange === r ? 'active' : ''}`} onClick={() => setAnalyticsRange(r)}>
                  {tr(r === '7d' ? 'range7d' : r === '30d' ? 'range30d' : 'rangeAll')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Inventory ── */}
        <div className="settings-section">
          <div className="settings-section-label"><TrendingDown size={13} /> {tr('sectionInventory')}</div>
          <div className="settings-card">
            <div className="settings-row-label">{tr('lowStockThresholdLabel')}</div>
            <div style={{ padding: '0 12px 12px' }}>
              <input
                type="text" inputMode="numeric"
                className="settings-danger-input"
                value={lowStockThreshold}
                onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v; setLowStockThreshold(v ? Number(v) : 0); }}
                placeholder="5"
              />
            </div>
            <div className="settings-divider" />
            <div className="settings-row-label">{tr('expiryWarningDaysLabel')}</div>
            <div style={{ padding: '0 12px 12px' }}>
              <input
                type="text" inputMode="numeric"
                className="settings-danger-input"
                value={expiryWarningDays}
                onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v; setExpiryWarningDays(v ? Math.max(1, Number(v)) : 1); }}
                placeholder="7"
              />
            </div>
            <div className="settings-divider" />
            <div className="settings-row-label">{tr('currencySymbolLabel')}</div>
            <div style={{ padding: '0 12px 12px' }}>
              <input
                type="text" maxLength={3}
                className="settings-danger-input"
                value={currencySymbol}
                onChange={e => setCurrencySymbol(e.target.value)}
                placeholder="฿"
              />
            </div>
            <div className="settings-divider" />
            <div className="settings-row-label">{tr('defaultUnitLabel')}</div>
            <div style={{ padding: '0 12px 12px' }}>
              <input
                type="text"
                className="settings-danger-input"
                value={defaultUnit}
                onChange={e => setDefaultUnit(e.target.value)}
                placeholder="pcs"
              />
            </div>
          </div>
        </div>

        {/* ── Store Info ── */}
        {isOwner && (
          <div className="settings-section">
            <div className="settings-section-label"><MapPin size={13} /> {tr('storeInfoLabel')}</div>
            <div className="settings-card">
              <div className="settings-row-label">{tr('storeNameSettingLabel')}</div>
              <div style={{ padding: '0 12px 12px' }}>
                <input type="text" className="settings-danger-input" value={storeName} onChange={e => setStoreName(e.target.value)} />
              </div>
              <div className="settings-divider" />
              <div className="settings-row-label">{tr('locationSettingLabel')}</div>
              <div style={{ padding: '0 12px 12px' }}>
                <input type="text" className="settings-danger-input" value={storeLocation} onChange={e => setStoreLocation(e.target.value)} />
              </div>
              <div style={{ padding: '0 12px 12px' }}>
                <button className="btn-primary" style={{ width: '100%' }} onClick={handleSaveStoreInfo} disabled={savingStore}>
                  {savingStore ? <><Loader2 size={15} className="spin" /> {tr('savingLabel')}</> : tr('saveStoreInfo')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Export / Import Data ── */}
        {isOwner && (
          <div className="settings-section">
            <div className="settings-section-label"><Download size={13} /> {tr('exportDataLabel')}</div>
            <div className="settings-card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
                <button className="btn-secondary" onClick={handleExportInventory}>
                  <Download size={14} /> {tr('exportInventoryBtn')}
                </button>
                <button className="btn-secondary" onClick={handleExportSales}>
                  <Download size={14} /> {tr('exportSalesBtn')}
                </button>
                <button className="btn-secondary" onClick={() => importRef.current?.click()} disabled={importing}>
                  {importing ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Import Inventory CSV
                </button>
                <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportInventory} />
                {importToast && <div style={{ color: 'var(--success)', fontSize: '13px' }}>{importToast}</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── Danger zone ── */}
        {isOwner && (
          <div className="settings-section">
            <div className="settings-section-label danger-label"><AlertTriangle size={13} /> {tr('sectionDanger')}</div>
            <div className="settings-card settings-danger-card">
              <div className="settings-danger-header">
                <Shield size={18} className="settings-danger-icon" />
                <div>
                  <div className="settings-danger-title">{tr('deleteAllProducts')}</div>
                  <div className="settings-danger-desc">{tr('deleteAllProductsDesc')}</div>
                </div>
              </div>
              <label className="settings-danger-confirm-label">{tr('deleteAllProductsConfirm')}</label>
              <input
                className="settings-danger-input"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
              <button className="settings-danger-btn" onClick={handleDeleteAll} disabled={confirmText !== 'DELETE' || deleting}>
                {deleting
                  ? <><Loader2 size={15} className="spin" /> {tr('deleting')}</>
                  : <><Trash2 size={15} /> {tr('deleteAllProductsBtn')}</>
                }
              </button>
            </div>
          </div>
        )}
      </div>

      {storeId && <StoreTabBar storeId={storeId} />}
    </div>
  );
}
