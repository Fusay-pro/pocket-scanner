import { useState, useEffect } from 'react';
import { Sparkles, Loader2, RefreshCw, TrendingUp, Package, AlertTriangle } from 'lucide-react';
import {
  fetchAIInsights,
  loadCachedInsights,
  clearCachedInsights,
  type AIInsightsResult,
} from '../utils/aiRecommendations';
import type { Product } from '../types';
import type { Sale } from '../utils/storage';

interface Props {
  storeId: string;
  storeName: string;
  products: Product[];
  sales: Sale[];
}

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AIInsightsPanel({ storeId, storeName, products, sales }: Props) {
  const [result, setResult] = useState<AIInsightsResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const cached = loadCachedInsights(storeId);
    if (cached) {
      setResult(cached.result);
      setGeneratedAt(cached.generatedAt);
    }
  }, [storeId]);

  async function handleAnalyze(force = false) {
    if (force) clearCachedInsights(storeId);
    setError('');
    setLoading(true);
    try {
      const { result: r, generatedAt: ts } = await fetchAIInsights(storeId, storeName, products, sales);
      setResult(r);
      setGeneratedAt(ts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed');
    } finally {
      setLoading(false);
    }
  }

  const hasData = products.length > 0;

  return (
    <div className="analytics-card ai-insights-section">
      <div className="ai-insights-header">
        <h3 className="analytics-section-title" style={{ margin: 0 }}>
          <Sparkles size={16} /> AI Insights
        </h3>
        {result && !loading && (
          <button className="btn-icon" onClick={() => handleAnalyze(true)} title="Refresh AI analysis">
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {generatedAt && (
        <p className="ai-insights-timestamp">Last analyzed {timeAgo(generatedAt)}</p>
      )}

      {error && (
        <div className="ai-insights-error" onClick={() => setError('')}>
          {error}
        </div>
      )}

      {loading && (
        <div className="ai-insights-loading">
          <Loader2 size={18} className="spin" />
          Analyzing your inventory…
        </div>
      )}

      {!result && !loading && (
        <div className="ai-insights-empty">
          {hasData ? (
            <>
              <Sparkles size={32} strokeWidth={1} />
              <p>Get AI-powered restock recommendations and demand predictions.</p>
              <button className="btn-primary" onClick={() => handleAnalyze(false)}>
                Analyze Inventory
              </button>
            </>
          ) : (
            <>
              <AlertTriangle size={28} strokeWidth={1} />
              <p>Add some products and sales data first.</p>
            </>
          )}
        </div>
      )}

      {result && !loading && (
        <>
          {result.restockItems.length > 0 && (
            <div className="ai-insights-subsection">
              <div className="ai-insights-subsection-title">
                <Package size={13} /> Restock Now
              </div>
              {result.restockItems.map((item, i) => (
                <div key={i} className="ai-restock-card">
                  <div className="ai-restock-card-row">
                    <span className="ai-restock-name">{item.productName}</span>
                    <div className="ai-restock-badges">
                      <span className="ai-badge-current">Now: {item.currentQty}</span>
                      <span className="ai-badge-suggested">Order: +{item.suggestedQty}</span>
                    </div>
                  </div>
                  <p className="ai-restock-reason">{item.reason}</p>
                </div>
              ))}
            </div>
          )}

          {result.watchItems.length > 0 && (
            <div className="ai-insights-subsection">
              <div className="ai-insights-subsection-title">
                <TrendingUp size={13} /> Watch These
              </div>
              {result.watchItems.map((item, i) => (
                <div key={i} className="ai-watch-item">
                  <span className="ai-watch-name">{item.productName}</span>
                  <span className="ai-watch-reason">{item.reason}</span>
                </div>
              ))}
            </div>
          )}

          {result.summary && (result.restockItems.length > 0 || result.watchItems.length > 0) && (
            <div className="ai-insights-subsection">
              <div className="ai-insights-subsection-title">
                <Sparkles size={13} /> Summary
              </div>
              <p className="ai-summary-text">{result.summary}</p>
            </div>
          )}

          {result.restockItems.length === 0 && result.watchItems.length === 0 && (
            <div className="ai-insights-empty" style={{ padding: '12px 0' }}>
              <p>{result.summary || 'No recommendations at this time.'}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
