import { errMsg } from '../utils/errMsg';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Trash2, Package, AlertTriangle, CheckCircle,
  Clock, Calendar, Loader2, Tag, Hash, Layers, DollarSign, Truck
} from 'lucide-react';
import { getProducts, updateProduct, deleteProduct, getStoreRole, type MemberRole } from '../utils/storage';
import { getExpiryStatus, formatDate } from '../types';
import { isSupabaseConfigured } from '../lib/supabase';
import { useSettings } from '../contexts/SettingsContext';
import { t } from '../i18n';
import type { Product } from '../types';

const CATEGORIES = ['Food', 'Beverage', 'Dairy', 'Produce', 'Bakery', 'Frozen', 'Snacks', 'Personal Care', 'Cleaning', 'Other'];
const UNITS = ['pcs', 'box', 'pack', 'kg', 'g', 'L', 'mL', 'bottle', 'can', 'bag'];

const STATUS_CONFIG_KEYS = {
  expired: { bg: 'var(--danger)',   light: 'var(--danger-light)',   icon: AlertTriangle, labelKey: 'statusExpired' as const },
  soon:    { bg: 'var(--warn)',     light: 'var(--warn-light)',     icon: Clock,         labelKey: 'statusSoon' as const },
  ok:      { bg: 'var(--success)',  light: 'var(--success-light)',  icon: CheckCircle,   labelKey: 'statusOk' as const },
  none:    { bg: 'var(--text-muted)', light: 'var(--bg)',           icon: Calendar,      labelKey: 'statusNone' as const },
};

export default function ProductPage() {
  const { storeId, productId } = useParams<{ storeId: string; productId: string }>();
  const navigate = useNavigate();
  const { lang, defaultUnit, expiryWarningDays } = useSettings();
  const tr = (key: Parameters<typeof t>[1]) => t(lang, key);
  const [product, setProduct] = useState<Product | null>(null);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    barcode: '', name: '', category: 'Food', quantity: '1',
    unit: defaultUnit, expiryDate: '', notes: '',
    costPrice: '', sellPrice: '', minQty: '', supplier: '',
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const isOwner = !isSupabaseConfigured || role === 'owner';

  useEffect(() => {
    if (!productId || !storeId) return;
    Promise.all([
      getProducts(),
      getStoreRole(storeId),
    ]).then(([all, r]) => {
      const found = all.find(p => p.id === productId) || null;
      setProduct(found);
      setRole(r);
      if (found) {
        setForm({
          barcode: found.barcode, name: found.name, category: found.category,
          quantity: String(found.quantity), unit: found.unit,
          expiryDate: found.expiryDate || '', notes: found.notes,
          costPrice: found.costPrice != null ? String(found.costPrice) : '',
          sellPrice: found.sellPrice != null ? String(found.sellPrice) : '',
          minQty: found.minQty != null ? String(found.minQty) : '',
          supplier: found.supplier ?? '',
        });
      }
      setLoading(false);
    }).catch(e => { setError(errMsg(e)); setLoading(false); });
  }, [productId, storeId]);

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
    setForm(prev => ({ ...prev, [field]: sanitizeNum(field, value) }));
    setDirty(true);
  }

  function hasInvalidNum(v: string) { return v !== '' && (isNaN(Number(v)) || Number(v) < 0); }

  async function handleSave() {
    if (!productId || !form.name.trim()) return;
    if (
      hasInvalidNum(form.quantity) || hasInvalidNum(form.costPrice) ||
      hasInvalidNum(form.sellPrice) || hasInvalidNum(form.minQty)
    ) { setError(tr('validationNumberInvalid')); return; }
    setSaving(true);
    try {
      await updateProduct(productId, {
        barcode: form.barcode.trim(), name: form.name.trim(),
        category: form.category, quantity: Number(form.quantity) || 1,
        unit: form.unit, expiryDate: form.expiryDate || null, notes: form.notes.trim(),
        costPrice: form.costPrice !== '' ? Number(form.costPrice) : null,
        sellPrice: form.sellPrice !== '' ? Number(form.sellPrice) : null,
        minQty: form.minQty !== '' ? Number(form.minQty) : null,
        supplier: form.supplier.trim() || null,
      });
      setDirty(false); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(errMsg(e)); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!productId || !confirm('Delete this product?')) return;
    try {
      await deleteProduct(productId);
      navigate(`/store/${storeId}`);
    } catch (e) { setError(errMsg(e)); }
  }

  if (loading) return (
    <div className="page"><div className="empty-state"><Loader2 size={32} className="spin" /></div></div>
  );

  if (!product) return (
    <div className="page"><div className="empty-state">{tr('productNotFound')}</div></div>
  );

  const status = getExpiryStatus(form.expiryDate || null, expiryWarningDays);
  const cfg = STATUS_CONFIG_KEYS[status];
  const StatusIcon = cfg.icon;

  return (
    <div className="page pp-page">
      <header className="page-header">
        <button className="btn-icon" onClick={() => navigate(`/store/${storeId}`)}>
          <ArrowLeft size={20} />
        </button>
        <div className="header-title flex-1">
          <h1>{tr('productDetailsTitle')}</h1>
        </div>
        {isOwner && (
          <button className="btn-danger-ghost" onClick={handleDelete} title="Delete product">
            <Trash2 size={18} />
          </button>
        )}
      </header>

      {saved && <div className="toast success"><CheckCircle size={18} /> {tr('savedToast')}</div>}
      {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}

      {/* ── Hero ── */}
      <div className="pp-hero" style={{ '--status-color': cfg.bg, '--status-light': cfg.light } as React.CSSProperties}>
        <div className="pp-hero-top">
          <span className="pp-category-pill">
            <Tag size={11} />
            {form.category}
          </span>
          <span className="pp-added-meta">
            <Package size={12} />
            {new Date(product.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <h2 className="pp-product-name">{form.name || <span style={{ opacity: 0.4 }}>{tr('unnamedProduct')}</span>}</h2>
        {form.barcode && (
          <div className="pp-barcode-row">
            <Hash size={13} />
            {form.barcode}
          </div>
        )}
        <div className="pp-status-card">
          <div className="pp-status-icon-wrap">
            <StatusIcon size={22} />
          </div>
          <div className="pp-status-text">
            <span className="pp-status-label">{tr(cfg.labelKey)}</span>
            <span className="pp-status-date">
              {status !== 'none'
                ? formatDate(form.expiryDate || null)
                : tr('setExpiryBelow')}
            </span>
          </div>
        </div>
      </div>

      {/* ── Form sections ── */}
      <div className="pp-body">

        <div className="pp-section">
          <div className="pp-section-label"><Hash size={12} /> {tr('sectionIdentity')}</div>
          <div className="pp-card">
            <div className="pp-field">
              <label>{tr('barcodeLabel')}</label>
              <input value={form.barcode} onChange={e => handleField('barcode', e.target.value)} placeholder={tr('scanOrEnterManually')} />
            </div>
            <div className="pp-divider" />
            <div className="pp-field">
              <label>{tr('productNameLabel')} <span className="pp-required">*</span></label>
              <input value={form.name} onChange={e => handleField('name', e.target.value)} placeholder="e.g. Whole Milk 1L" />
            </div>
          </div>
        </div>

        <div className="pp-section">
          <div className="pp-section-label"><Layers size={12} /> {tr('sectionStockLabel')}</div>
          <div className="pp-card">
            <div className="pp-field-row">
              <div className="pp-field pp-field-grow">
                <label>{tr('categoryLabel')}</label>
                <select value={form.category} onChange={e => handleField('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="pp-field pp-field-sm">
                <label>{tr('qtyLabel')}</label>
                <input type="text" inputMode="numeric" value={form.quantity} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v; handleField('quantity', v); }} />
              </div>
              <div className="pp-field pp-field-sm">
                <label>{tr('unitLabel')}</label>
                <select value={form.unit} onChange={e => handleField('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="pp-divider" />
            <div className="pp-field pp-field-sm">
              <label>{tr('minStockQtyLabel')}</label>
              <input type="text" inputMode="numeric" value={form.minQty} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); e.target.value = v; handleField('minQty', v); }} placeholder="e.g. 5" />
            </div>
          </div>
        </div>

        <div className="pp-section">
          <div className="pp-section-label"><DollarSign size={12} /> {tr('sectionPricing')}</div>
          <div className="pp-card">
            <div className="pp-field-row">
              <div className="pp-field pp-field-grow">
                <label>{tr('costPriceLabel')}</label>
                <input type="text" inputMode="decimal" value={form.costPrice} onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); e.target.value = v; handleField('costPrice', v); }} placeholder="0.00" />
              </div>
              <div className="pp-field pp-field-grow">
                <label>{tr('sellPriceLabel')}</label>
                <input type="text" inputMode="decimal" value={form.sellPrice} onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); e.target.value = v; handleField('sellPrice', v); }} placeholder="0.00" />
              </div>
            </div>
          </div>
        </div>

        <div className="pp-section">
          <div className="pp-section-label"><Calendar size={12} /> {tr('sectionExpiry')}</div>
          <div className="pp-card">
            <div className="pp-field">
              <label>{tr('expiryDateLabel')}</label>
              <input type="date" value={form.expiryDate} onChange={e => handleField('expiryDate', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="pp-section">
          <div className="pp-section-label"><Package size={12} /> {tr('sectionNotes')}</div>
          <div className="pp-card">
            <div className="pp-field">
              <textarea
                value={form.notes}
                onChange={e => handleField('notes', e.target.value)}
                rows={3}
                placeholder={tr('notesPlaceholder')}
              />
            </div>
          </div>
        </div>

        <div className="pp-section">
          <div className="pp-section-label"><Truck size={12} /> {tr('supplierLabel')}</div>
          <div className="pp-card">
            <div className="pp-field">
              <input
                value={form.supplier}
                onChange={e => handleField('supplier', e.target.value)}
                placeholder="e.g. ABC Distributors"
              />
            </div>
          </div>
        </div>

        <button
          className="btn-primary full-width pp-save-btn"
          onClick={handleSave}
          disabled={!dirty || !form.name.trim() || saving}
        >
          {saving ? <><Loader2 size={16} className="spin" /> {tr('savingLabel')}</> : <><Save size={18} /> {tr('saveChanges')}</>}
        </button>
      </div>
    </div>
  );
}
