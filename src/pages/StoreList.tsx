import { errMsg } from '../utils/errMsg';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Warehouse, Plus, Trash2, ChevronRight, MapPin, Package, Loader2, LogOut } from 'lucide-react';
import { getStores, saveStore, deleteStore, getProductsByStore, getStoreRole } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import type { Store as StoreType } from '../types';

export default function StoreList() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [stores, setStores] = useState<StoreType[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [ownerOf, setOwnerOf] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await getStores();
      setStores(data);
      const c: Record<string, number> = {};
      const o: Record<string, boolean> = {};
      await Promise.all(data.map(async s => {
        const [products, role] = await Promise.all([
          getProductsByStore(s.id),
          isSupabaseConfigured ? getStoreRole(s.id) : Promise.resolve('owner' as const),
        ]);
        c[s.id] = products.length;
        o[s.id] = role === 'owner';
      }));
      setCounts(c);
      setOwnerOf(o);
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const store = await saveStore({ name: name.trim(), location: location.trim() });
      setStores(prev => [store, ...prev]);
      setCounts(prev => ({ ...prev, [store.id]: 0 }));
      setOwnerOf(prev => ({ ...prev, [store.id]: true }));
      setName(''); setLocation(''); setShowForm(false);
    } catch (e) { setError(errMsg(e)); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this store and all its products?')) return;
    try {
      await deleteStore(id);
      setStores(prev => prev.filter(s => s.id !== id));
    } catch (e) { setError(errMsg(e)); }
  }

  async function handleSignOut() {
    await signOut();
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="header-title">
          <Warehouse size={24} />
          <h1>Pocket Scanner</h1>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button className="btn-icon" onClick={() => setShowForm(true)} title="Add store">
            <Plus size={20} />
          </button>
          {isSupabaseConfigured && user && (
            <button className="btn-icon" onClick={handleSignOut} title={`Sign out (${user.email})`}>
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      {isSupabaseConfigured && user && (
        <div className="user-bar">
          Signed in as <strong>{user.email}</strong>
        </div>
      )}

      {error && <div className="error-bar" onClick={() => setError('')}>{error} (tap to dismiss)</div>}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add Store</h2>
            <label>Store Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Main Branch" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            <label>Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Downtown, Floor 1"
              onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAdd} disabled={!name.trim() || saving}>
                {saving ? <><Loader2 size={16} className="spin" /> Saving…</> : 'Add Store'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state"><Loader2 size={32} className="spin" /><p>Loading…</p></div>
      ) : stores.length === 0 ? (
        <div className="empty-state">
          <Store size={56} strokeWidth={1} />
          <p>No stores yet</p>
          <button className="btn-primary" onClick={() => setShowForm(true)}>Add your first store</button>
        </div>
      ) : (
        <div className="card-list">
          {stores.map(store => (
            <div key={store.id} className="card" onClick={() => navigate(`/store/${store.id}`)}>
              <div className="card-body">
                <div className="card-icon store-icon"><Store size={20} /></div>
                <div className="card-info">
                  <h3>{store.name}</h3>
                  <div className="card-meta">
                    {store.location && <span><MapPin size={12} /> {store.location}</span>}
                    <span><Package size={12} /> {counts[store.id] ?? 0} items</span>
                  </div>
                </div>
                <div className="card-actions">
                  {ownerOf[store.id] && (
                    <button className="btn-danger-ghost" onClick={e => handleDelete(store.id, e)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                  <ChevronRight size={18} className="chevron" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
