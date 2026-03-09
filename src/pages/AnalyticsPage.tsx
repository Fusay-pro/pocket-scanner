import { errMsg } from '../utils/errMsg';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart2, TrendingUp, Package, ShoppingCart,
  Loader2, Trophy, Tag
} from 'lucide-react';
import { getStores, getSalesByStore, getStoreRole } from '../utils/storage';
import type { Sale, MemberRole } from '../utils/storage';
import type { Store } from '../types';
import StoreTabBar from '../components/StoreTabBar';
import { useSettings } from '../contexts/SettingsContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { t } from '../i18n';
import { ShieldOff } from 'lucide-react';

interface TopProduct { name: string; category: string; totalSold: number; transactions: number; revenue: number | null; }
interface CategoryStat { category: string; totalSold: number; }
interface DayStat { label: string; date: string; totalSold: number; revenue: number; }

function computeStats(sales: Sale[]) {
  // Top products
  const prodMap = new Map<string, TopProduct>();
  for (const s of sales) {
    const key = s.productName;
    const existing = prodMap.get(key);
    if (existing) {
      existing.totalSold += s.quantitySold;
      existing.transactions++;
      if (s.revenue != null) existing.revenue = (existing.revenue ?? 0) + s.revenue;
    } else {
      prodMap.set(key, { name: s.productName, category: s.category, totalSold: s.quantitySold, transactions: 1, revenue: s.revenue ?? null });
    }
  }
  const topProducts = Array.from(prodMap.values()).sort((a, b) => b.totalSold - a.totalSold).slice(0, 8);

  // Category breakdown
  const catMap = new Map<string, number>();
  for (const s of sales) {
    catMap.set(s.category, (catMap.get(s.category) || 0) + s.quantitySold);
  }
  const categories: CategoryStat[] = Array.from(catMap.entries())
    .map(([category, totalSold]) => ({ category, totalSold }))
    .sort((a, b) => b.totalSold - a.totalSold);

  // Last 7 days trend
  const days: DayStat[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday'
      : d.toLocaleDateString('en-US', { weekday: 'short' });
    const daySales = sales.filter(s => s.soldAt.slice(0, 10) === dateStr);
    const totalSold = daySales.reduce((sum, s) => sum + s.quantitySold, 0);
    const revenue = daySales.reduce((sum, s) => sum + (s.revenue ?? 0), 0);
    days.push({ label, date: dateStr, totalSold, revenue });
  }

  const totalUnits = sales.reduce((sum, s) => sum + s.quantitySold, 0);
  const totalTransactions = sales.length;
  const totalRevenue = sales.reduce((sum, s) => sum + (s.revenue ?? 0), 0);
  const salesWithCost = sales.filter(s => s.revenue != null);
  const hasRevenue = salesWithCost.length > 0;

  return { topProducts, categories, days, totalUnits, totalTransactions, totalRevenue, hasRevenue };
}

const CATEGORY_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

export default function AnalyticsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const [store, setStore] = useState<Store | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const { lang, analyticsRange: defaultRange } = useSettings();
  const tr = (key: Parameters<typeof t>[1]) => t(lang, key);
  const [range, setRange] = useState<'7d' | '30d' | 'all'>(defaultRange);
  const [error, setError] = useState('');
  const [role, setRole] = useState<MemberRole | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!storeId) return;
    if (isSupabaseConfigured) {
      getStoreRole(storeId).then(r => { setRole(r); setRoleLoaded(true); });
    }
    Promise.all([getStores(), getSalesByStore(storeId)])
      .then(([stores, s]) => {
        setStore(stores.find(st => st.id === storeId) || null);
        setSales(s);
      })
      .catch(e => setError(errMsg(e)))
      .finally(() => setLoading(false));
  }, [storeId]);

  const isOwner = !isSupabaseConfigured || role === 'owner';

  const filteredSales = sales.filter(s => {
    if (range === 'all') return true;
    const days = range === '7d' ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return new Date(s.soldAt) >= cutoff;
  });

  const { topProducts, categories, days, totalUnits, totalTransactions, totalRevenue, hasRevenue } = computeStats(filteredSales);
  const dayMax = Math.max(...days.map(d => d.totalSold), 1);
  const dayRevMax = Math.max(...days.map(d => d.revenue), 1);
  const catMax = Math.max(...categories.map(c => c.totalSold), 1);
  const prodMax = Math.max(...topProducts.map(p => p.totalSold), 1);

  return (
    <div className="page analytics-page">
      <header className="page-header">
        <button className="btn-icon" onClick={() => navigate('/')}><ArrowLeft size={20} /></button>
        <div className="header-title flex-1">
          <BarChart2 size={20} />
          <h1>{tr('analyticsTitle')}</h1>
        </div>
        {store && <span className="store-badge">{store.name}</span>}
      </header>

      {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}

      {roleLoaded && !isOwner && (
        <div className="empty-state">
          <ShieldOff size={48} strokeWidth={1} />
          <p>{tr('ownerAccessOnly')}</p>
          <p style={{ fontSize: '13px' }}>{tr('analyticsOwnerOnly')}</p>
        </div>
      )}

      {roleLoaded && isOwner && <>

      {/* Range picker */}
      <div className="analytics-range">
        {(['7d', '30d', 'all'] as const).map(r => (
          <button key={r} className={`range-btn ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
            {r === '7d' ? tr('last7days') : r === '30d' ? tr('last30days') : tr('allTime')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><Loader2 size={32} className="spin" /></div>
      ) : filteredSales.length === 0 ? (
        <div className="empty-state">
          <BarChart2 size={48} strokeWidth={1} />
          <p>{tr('noSalesYet')}</p>
          <p style={{ fontSize: '13px' }}>{tr('noSalesDesc')}</p>
        </div>
      ) : (
        <div className="analytics-body">

          {/* KPI cards */}
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-icon kpi-blue"><ShoppingCart size={18} /></div>
              <div>
                <p className="kpi-value">{totalTransactions}</p>
                <p className="kpi-label">{tr('transactions')}</p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon kpi-green"><Package size={18} /></div>
              <div>
                <p className="kpi-value">{totalUnits}</p>
                <p className="kpi-label">{tr('unitsSold')}</p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon kpi-purple"><TrendingUp size={18} /></div>
              <div>
                <p className="kpi-value">
                  {totalTransactions > 0 ? (totalUnits / totalTransactions).toFixed(1) : '0'}
                </p>
                <p className="kpi-label">{tr('avgPerSale')}</p>
              </div>
            </div>
          </div>
          {hasRevenue && (
            <div className="kpi-row">
              <div className="kpi-card">
                <div className="kpi-icon kpi-green"><TrendingUp size={18} /></div>
                <div>
                  <p className="kpi-value">฿{totalRevenue.toFixed(0)}</p>
                  <p className="kpi-label">{tr('revenueLabel')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Daily trend */}
          <div className="analytics-card">
            <h3 className="analytics-section-title"><TrendingUp size={16} /> {tr('dailySales')}</h3>
            <div className="bar-chart">
              {days.map(day => (
                <div key={day.date} className="bar-col">
                  <div className="bar-value-label">
                    {day.totalSold > 0 ? day.totalSold : ''}
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill bar-fill-blue"
                      style={{ height: `${(day.totalSold / dayMax) * 100}%` }}
                    />
                    {hasRevenue && day.revenue > 0 && (
                      <div
                        className="bar-fill bar-fill-revenue"
                        style={{ height: `${(day.revenue / dayRevMax) * 100}%` }}
                        title={`฿${day.revenue.toFixed(0)}`}
                      />
                    )}
                  </div>
                  <div className="bar-label">{day.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Top products */}
          <div className="analytics-card">
            <h3 className="analytics-section-title"><Trophy size={16} /> {tr('topProductsTitle')}</h3>
            <div className="top-list">
              {topProducts.map((p, i) => (
                <div key={p.name} className="top-row">
                  <div className="top-rank">{i + 1}</div>
                  <div className="top-info">
                    <p className="top-name">{p.name}</p>
                    <p className="top-meta">{p.category} · {p.transactions} {lang === 'th' ? tr('saleLabel') : (p.transactions !== 1 ? tr('salesLabel') : tr('saleLabel'))}</p>
                    <div className="inline-bar-track">
                      <div
                        className="inline-bar-fill"
                        style={{
                          width: `${(p.totalSold / prodMax) * 100}%`,
                          background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                  <div className="top-count">
                    {p.totalSold}
                    {p.revenue != null && <div style={{ fontSize: '10px', color: 'var(--success)', fontWeight: 700 }}>฿{p.revenue.toFixed(0)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category breakdown */}
          {categories.length > 0 && (
            <div className="analytics-card">
              <h3 className="analytics-section-title"><Tag size={16} /> {tr('byCategory')}</h3>
              <div className="top-list">
                {categories.map((c, i) => (
                  <div key={c.category} className="top-row">
                    <div
                      className="cat-dot"
                      style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                    />
                    <div className="top-info">
                      <p className="top-name">{c.category}</p>
                      <div className="inline-bar-track">
                        <div
                          className="inline-bar-fill"
                          style={{
                            width: `${(c.totalSold / catMax) * 100}%`,
                            background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                    <div className="top-count">{c.totalSold}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      </> /* end isOwner guard */}

      <StoreTabBar storeId={storeId!} />
    </div>
  );
}
