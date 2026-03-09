import { errMsg } from '../utils/errMsg';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Globe, Sun, Moon, BarChart2, Trash2,
  AlertTriangle, CheckCircle, Loader2, Shield, TrendingDown
} from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { getStoreRole, deleteAllProductsByStore } from '../utils/storage';
import { t } from '../i18n';
import { isSupabaseConfigured } from '../lib/supabase';
import StoreTabBar from '../components/StoreTabBar';
import { useEffect } from 'react';
import type { MemberRole } from '../utils/storage';

export default function SettingsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const { lang, theme, analyticsRange, lowStockThreshold, setLang, setTheme, setAnalyticsRange, setLowStockThreshold } = useSettings();
  const [role, setRole] = useState<MemberRole | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState('');

  const isOwner = !isSupabaseConfigured || role === 'owner';

  useEffect(() => {
    if (!storeId) return;
    getStoreRole(storeId).then(setRole);
  }, [storeId]);

  async function handleDeleteAll() {
    if (!storeId || confirmText !== 'DELETE') return;
    setDeleting(true);
    setError('');
    try {
      await deleteAllProductsByStore(storeId);
      setDeleted(true);
      setConfirmText('');
      setTimeout(() => setDeleted(false), 3000);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setDeleting(false);
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
      {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}

      <div className="settings-body">

        {/* ── Language ── */}
        <div className="settings-section">
          <div className="settings-section-label">
            <Globe size={13} /> {tr('sectionLanguage')}
          </div>
          <div className="settings-card">
            <button
              className={`settings-option ${lang === 'en' ? 'active' : ''}`}
              onClick={() => setLang('en')}
            >
              <span className="settings-option-flag">🇺🇸</span>
              <span className="settings-option-label">{tr('langEnglish')}</span>
              {lang === 'en' && <CheckCircle size={16} className="settings-check" />}
            </button>
            <div className="settings-divider" />
            <button
              className={`settings-option ${lang === 'th' ? 'active' : ''}`}
              onClick={() => setLang('th')}
            >
              <span className="settings-option-flag">🇹🇭</span>
              <span className="settings-option-label">{tr('langThai')}</span>
              {lang === 'th' && <CheckCircle size={16} className="settings-check" />}
            </button>
          </div>
        </div>

        {/* ── Appearance ── */}
        <div className="settings-section">
          <div className="settings-section-label">
            <Sun size={13} /> {tr('sectionAppearance')}
          </div>
          <div className="settings-card settings-card-row">
            <button
              className={`settings-theme-btn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
            >
              <Sun size={20} />
              <span>{tr('themeLight')}</span>
            </button>
            <button
              className={`settings-theme-btn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <Moon size={20} />
              <span>{tr('themeDark')}</span>
            </button>
          </div>
        </div>

        {/* ── Analytics ── */}
        <div className="settings-section">
          <div className="settings-section-label">
            <BarChart2 size={13} /> {tr('sectionAnalytics')}
          </div>
          <div className="settings-card">
            <div className="settings-row-label">{tr('analyticsDefaultRange')}</div>
            <div className="settings-segment">
              {(['7d', '30d', 'all'] as const).map(r => (
                <button
                  key={r}
                  className={`settings-segment-btn ${analyticsRange === r ? 'active' : ''}`}
                  onClick={() => setAnalyticsRange(r)}
                >
                  {tr(r === '7d' ? 'range7d' : r === '30d' ? 'range30d' : 'rangeAll')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Inventory ── */}
        <div className="settings-section">
          <div className="settings-section-label">
            <TrendingDown size={13} /> {tr('sectionInventory')}
          </div>
          <div className="settings-card">
            <div className="settings-row-label">{tr('lowStockThresholdLabel')}</div>
            <div style={{ padding: '0 12px 12px' }}>
              <input
                type="number"
                min="0"
                className="settings-danger-input"
                value={lowStockThreshold}
                onChange={e => setLowStockThreshold(Number(e.target.value) || 0)}
                placeholder="5"
              />
            </div>
          </div>
        </div>

        {/* ── Danger zone ── */}
        {isOwner && (
          <div className="settings-section">
            <div className="settings-section-label danger-label">
              <AlertTriangle size={13} /> {tr('sectionDanger')}
            </div>
            <div className="settings-card settings-danger-card">
              <div className="settings-danger-header">
                <Shield size={18} className="settings-danger-icon" />
                <div>
                  <div className="settings-danger-title">{tr('deleteAllProducts')}</div>
                  <div className="settings-danger-desc">{tr('deleteAllProductsDesc')}</div>
                </div>
              </div>
              <label className="settings-danger-confirm-label">
                {tr('deleteAllProductsConfirm')}
              </label>
              <input
                className="settings-danger-input"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
              <button
                className="settings-danger-btn"
                onClick={handleDeleteAll}
                disabled={confirmText !== 'DELETE' || deleting}
              >
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
