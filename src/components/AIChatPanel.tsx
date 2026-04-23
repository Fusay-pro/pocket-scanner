import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Sparkles } from 'lucide-react';
import { sendChatMessage, type ChatMessage } from '../utils/aiChat';
import { getProductsByStore, getSalesByStore } from '../utils/storage';
import { getExpiryStatus } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import type { Product } from '../types';
import type { Sale } from '../utils/storage';

interface Props {
  storeId: string;
  storeName: string;
}

function buildSystemPrompt(storeName: string, products: Product[], sales: Sale[], lowStockThreshold: number, currencySymbol: string): string {
  const today = new Date().toISOString().slice(0, 10);

  const expired = products.filter(p => getExpiryStatus(p.expiryDate) === 'expired');
  const expiringSoon = products.filter(p => getExpiryStatus(p.expiryDate) === 'soon');
  const lowStock = products.filter(p => p.quantity <= (p.minQty ?? lowStockThreshold));

  const productLines = products.slice(0, 60).map(p => {
    const status = getExpiryStatus(p.expiryDate);
    const expiryNote = p.expiryDate ? ` | expiry: ${p.expiryDate} (${status})` : '';
    const priceNote = p.sellPrice != null ? ` | price: ${currencySymbol}${p.sellPrice}` : '';
    return `- ${p.name} [${p.category}] qty:${p.quantity}${p.unit}${expiryNote}${priceNote}`;
  }).join('\n');

  const salesByProduct: Record<string, number> = {};
  for (const s of sales) {
    salesByProduct[s.productName] = (salesByProduct[s.productName] ?? 0) + s.quantitySold;
  }
  const topSales = Object.entries(salesByProduct)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, qty]) => `- ${name}: ${qty} sold`)
    .join('\n');

  return `You are an AI assistant for Pocket Scanner, an inventory management app.
You are helping the owner of store "${storeName}".
Today's date: ${today}

=== CURRENT INVENTORY (${products.length} products) ===
${productLines || 'No products yet.'}

=== ALERTS ===
Expired items: ${expired.length} (${expired.map(p => p.name).join(', ') || 'none'})
Expiring soon: ${expiringSoon.length} (${expiringSoon.map(p => p.name).join(', ') || 'none'})
Low stock: ${lowStock.length} (${lowStock.map(p => `${p.name}(${p.quantity})`).join(', ') || 'none'})

=== TOP SELLING PRODUCTS ===
${topSales || 'No sales recorded yet.'}

Answer questions about inventory, expiry, low stock, sales, and give actionable recommendations.
Be concise and friendly. Use the store's currency symbol: ${currencySymbol}.
If asked something unrelated to inventory/business, gently redirect.`;
}

const SUGGESTIONS = [
  'What products are expiring soon?',
  'What items are low on stock?',
  'Give me an inventory summary',
  'Which products should I restock?',
];

export default function AIChatPanel({ storeId, storeName }: Props) {
  const { lowStockThreshold, currencySymbol } = useSettings();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contextLoaded, setContextLoaded] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !contextLoaded) {
      Promise.all([
        getProductsByStore(storeId),
        getSalesByStore(storeId),
      ]).then(([prods, salesData]) => {
        setProducts(prods);
        setSales(salesData);
        setContextLoaded(true);
      });
    }
  }, [open, contextLoaded, storeId]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setError('');
    setInput('');
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: msg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const systemPrompt = buildSystemPrompt(storeName, products, sales, lowStockThreshold, currencySymbol);
      const reply = await sendChatMessage(newMessages, systemPrompt);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const showSuggestions = messages.length === 0 && !loading && contextLoaded;

  return (
    <>
      {/* Floating button */}
      <button
        className="ai-fab"
        onClick={() => setOpen(o => !o)}
        aria-label="AI Assistant"
      >
        {open ? <X size={22} /> : <><Bot size={20} /><span className="ai-fab-label">AI</span></>}
      </button>

      {/* Panel */}
      {open && (
        <div className="ai-panel">
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <Sparkles size={16} />
              <span>AI Assistant</span>
            </div>
            <button className="btn-icon" onClick={() => setOpen(false)}><X size={18} /></button>
          </div>

          <div className="ai-messages">
            {messages.length === 0 && contextLoaded && (
              <div className="ai-welcome">
                <Bot size={32} className="ai-welcome-icon" />
                <p>Hi! I know your <strong>{storeName}</strong> inventory. Ask me anything.</p>
              </div>
            )}

            {!contextLoaded && (
              <div className="ai-welcome">
                <Loader2 size={24} className="spin" />
                <p>Loading store data…</p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`ai-bubble ai-bubble-${m.role}`}>
                {m.content}
              </div>
            ))}

            {loading && (
              <div className="ai-bubble ai-bubble-assistant ai-typing">
                <span /><span /><span />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {showSuggestions && (
            <div className="ai-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="ai-suggestion-chip" onClick={() => handleSend(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="ai-error" onClick={() => setError('')}>{error}</div>
          )}

          <div className="ai-input-row">
            <input
              ref={inputRef}
              className="ai-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about your inventory…"
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={loading || !contextLoaded}
            />
            <button
              className="ai-send-btn"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading || !contextLoaded}
            >
              {loading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
