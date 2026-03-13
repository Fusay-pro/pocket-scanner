import { errMsg } from '../utils/errMsg';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart2, TrendingUp, Package, Store, Loader2 } from 'lucide-react';
import { getStores, getSalesByStore } from '../utils/storage';
import type { Sale } from '../utils/storage';
import type { Store as StoreType } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { t } from '../i18n';

interface StoreStat {
  store: StoreType;
  sales: Sale[];
  revenue: number;
  units: number;
  transactions: number;
}

function filterByRange(sales: Sale[], range: '7d' | '30d' | 'all'): Sale[] {
  if (range === 'all') return sales;
  const days = range === '7d' ? 7 : 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return sales.filter(s => new Date(s.soldAt) >= cutoff);
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const { lang, analyticsRange: defaultRange } = useSettings();
  const tr = (key: Parameters<typeof t>[1]) => t(lang, key);
  const [storeStats, setStoreStats] = useState<StoreStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState<'7d' | '30d' | 'all'>(defaultRange);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const stores = await getStores();
        const salesPerStore = await Promise.all(stores.map(s => getSalesByStore(s.id)));
        const stats: StoreStat[] = stores.map((store, i) => ({
          store,
          sales: salesPerStore[i],
          revenue: 0,
          units: 0,
          transactions: 0,
        }));
        setStoreStats(stats);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Apply range filter and compute aggregates
  const filteredStats = storeStats.map(stat => {
    const filtered = filterByRange(stat.sales, range);
    return {
      ...stat,
      revenue: filtered.reduce((sum, s) => sum + (s.revenue ?? 0), 0),
      units: filtered.reduce((sum, s) => sum + s.quantitySold, 0),
      transactions: filtered.length,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = filteredStats.reduce((sum, s) => sum + s.revenue, 0);
  const totalUnits = filteredStats.reduce((sum, s) => sum + s.units, 0);
  const storeCount = storeStats.length;
  const maxRevenue = Math.max(...filteredStats.map(s => s.revenue), 1);

  return (
    <div className="page analytics-page">
      <header className="page-header">
        <button className="btn-icon" onClick={() => navigate('/')}><ArrowLeft size={20} /></button>
        <div className="header-title flex-1">
          <BarChart2 size={20} />
          <h1>Overview</h1>
        </div>
      </header>

      {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}

      {/* Range picker */}
      <div className="analytics-range-tabs">
        {(['7d', '30d', 'all'] as const).map(r => (
          <button
            key={r}
            className={`range-tab ${range === r ? 'active' : ''}`}
            onClick={() => setRange(r)}
          >
            {r === '7d' ? tr('last7days') : r === '30d' ? tr('last30days') : tr('allTime')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><Loader2 size={32} className="spin" /></div>
      ) : storeStats.length === 0 ? (
        <div className="empty-state">
          <Store size={56} strokeWidth={1} />
          <p>No stores yet</p>
        </div>
      ) : (
        <div className="analytics-body">

          {/* KPI cards */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon kpi-green"><TrendingUp size={18} /></div>
              <div>
                <p className="kpi-value">฿{totalRevenue.toFixed(0)}</p>
                <p className="kpi-label">{tr('revenueLabel')}</p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon kpi-blue"><Package size={18} /></div>
              <div>
                <p className="kpi-value">{totalUnits}</p>
                <p className="kpi-label">{tr('unitsSold')}</p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon kpi-purple"><Store size={18} /></div>
              <div>
                <p className="kpi-value">{storeCount}</p>
                <p className="kpi-label">Total Stores</p>
              </div>
            </div>
          </div>

          {/* Per-store revenue list */}
          <div className="analytics-card">
            <h3 className="analytics-section-title"><BarChart2 size={16} /> Revenue by Store</h3>
            <div className="top-list">
              {filteredStats.map((stat, i) => (
                <div
                  key={stat.store.id}
                  className="top-row"
                  onClick={() => navigate(`/store/${stat.store.id}/analytics`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="top-rank">{i + 1}</div>
                  <div className="top-info">
                    <p className="top-name">{stat.store.name}</p>
                    <p className="top-meta">
                      {stat.units} {tr('unitsSold').toLowerCase()} · {stat.transactions} {stat.transactions !== 1 ? tr('transactions').toLowerCase() : 'transaction'}
                    </p>
                    <div className="inline-bar-track">
                      <div
                        className="inline-bar-fill"
                        style={{
                          width: `${(stat.revenue / maxRevenue) * 100}%`,
                          background: 'var(--primary)',
                        }}
                      />
                    </div>
                  </div>
                  <div className="top-count">
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>฿{stat.revenue.toFixed(0)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
