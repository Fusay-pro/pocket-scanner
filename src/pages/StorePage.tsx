import { errMsg } from '../utils/errMsg';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ScanLine, Package, AlertTriangle, CheckCircle, Clock,
  Search, Trash2, ChevronRight, Loader2, Users, UserPlus,
  UserX, ShieldCheck, Shield, X, TrendingDown
} from 'lucide-react';
import {
  getStores, getProductsByStore, deleteProduct, updateStore,
  getStoreRole, getStoreMembers, getInvitations,
  inviteWorker, removeMember, changeMemberRole, cancelInvitation,
  type StoreMember, type StoreInvitation, type MemberRole,
} from '../utils/storage';
import { getExpiryStatus, formatDate } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { t } from '../i18n';
import StoreTabBar from '../components/StoreTabBar';
import type { Store, Product } from '../types';

type FilterType = 'all' | 'expired' | 'soon' | 'ok' | 'low';

export default function StorePage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, lowStockThreshold } = useSettings();
  const tr = (key: Parameters<typeof t>[1]) => t(lang, key);

  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingName, setEditingName] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [error, setError] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Members panel
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [invitations, setInvitations] = useState<StoreInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('worker');
  const [inviting, setInviting] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    load();
  }, [storeId]);

  async function load() {
    try {
      setLoading(true);
      const [stores, prods, r] = await Promise.all([
        getStores(),
        getProductsByStore(storeId!),
        getStoreRole(storeId!),
      ]);
      const found = stores.find(s => s.id === storeId) || null;
      setStore(found);
      if (found) setStoreName(found.name);
      setProducts(prods);
      setRole(r);
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }

  async function loadMembers() {
    if (!storeId) return;
    setMembersLoading(true);
    try {
      const [m, inv] = await Promise.all([
        getStoreMembers(storeId),
        getInvitations(storeId),
      ]);
      setMembers(m);
      setInvitations(inv);
    } catch (e) { setError(errMsg(e)); }
    finally { setMembersLoading(false); }
  }

  async function handleDeleteProduct(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Remove this product?')) return;
    try {
      await deleteProduct(id);
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (e) { setError(errMsg(e)); }
  }

  async function handleSaveName() {
    if (!storeId || !storeName.trim()) return;
    try {
      await updateStore(storeId, { name: storeName.trim() });
      setStore(prev => prev ? { ...prev, name: storeName.trim() } : null);
    } catch (e) { setError(errMsg(e)); }
    setEditingName(false);
  }

  async function handleInvite() {
    if (!storeId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await inviteWorker(storeId, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      await loadMembers();
    } catch (e) { setError(errMsg(e)); }
    finally { setInviting(false); }
  }

  async function handleRemoveMember(userId: string) {
    if (!storeId || !confirm('Remove this member?')) return;
    try {
      await removeMember(storeId, userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
    } catch (e) { setError(errMsg(e)); }
  }

  async function handleChangeRole(userId: string, newRole: MemberRole) {
    if (!storeId) return;
    try {
      await changeMemberRole(storeId, userId, newRole);
      setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role: newRole } : m));
    } catch (e) { setError(errMsg(e)); }
  }

  async function handleCancelInvite(invId: string) {
    try {
      await cancelInvitation(invId);
      setInvitations(prev => prev.filter(i => i.id !== invId));
    } catch (e) { setError(errMsg(e)); }
  }

  function openMembers() {
    setShowMembers(true);
    loadMembers();
  }

  const isOwner = !isSupabaseConfigured || role === 'owner';

  function isLowStock(p: Product) {
    return p.quantity <= (p.minQty ?? lowStockThreshold);
  }

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search) ||
      p.category.toLowerCase().includes(search.toLowerCase());
    const status = getExpiryStatus(p.expiryDate);
    if (filter === 'low') return matchSearch && isLowStock(p);
    const matchFilter = filter === 'all' || status === filter;
    return matchSearch && matchFilter;
  });

  const expiredCount = products.filter(p => getExpiryStatus(p.expiryDate) === 'expired').length;
  const soonCount = products.filter(p => getExpiryStatus(p.expiryDate) === 'soon').length;
  const lowStockCount = products.filter(isLowStock).length;

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-icon" onClick={() => navigate('/')}><ArrowLeft size={20} /></button>
        <div className="header-title flex-1">
          {editingName && isOwner ? (
            <input className="inline-edit" value={storeName}
              onChange={e => setStoreName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
              autoFocus />
          ) : (
            <h1 onClick={() => isOwner && setEditingName(true)}
              className={isOwner ? 'editable-title' : ''}>
              {store?.name ?? '…'}
            </h1>
          )}
          {store?.location && <p className="subtitle">{store.location}</p>}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {isOwner && isSupabaseConfigured && (
            <button className="btn-icon" onClick={openMembers} title="Manage members">
              <Users size={20} />
            </button>
          )}
          <button className="btn-primary scan-btn" onClick={() => navigate(`/store/${storeId}/scan`)}>
            <ScanLine size={18} /> {tr('scanBtn')}
          </button>
        </div>
      </header>

      {/* Role badge for workers */}
      {isSupabaseConfigured && role === 'worker' && (
        <div className="role-bar role-worker">
          <Shield size={14} /> {tr('workerRoleBar')}
        </div>
      )}
      {isSupabaseConfigured && role === 'owner' && (
        <div className="role-bar role-owner">
          <ShieldCheck size={14} /> {tr('ownerRoleBar')}
        </div>
      )}

      {error && <div className="error-bar" onClick={() => setError('')}>{error}</div>}

      {/* Members Panel */}
      {showMembers && (
        <div className="modal-overlay" onClick={() => setShowMembers(false)}>
          <div className="modal members-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header-row">
              <h2><Users size={18} /> {tr('membersTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowMembers(false)}><X size={18} /></button>
            </div>

            {/* Invite */}
            <div className="invite-row">
              <input
                className="invite-input"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="worker@email.com"
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as MemberRole)}
                className="invite-role-select"
              >
                <option value="worker">{tr('workerOption')}</option>
                <option value="owner">{tr('ownerRoleBar')}</option>
              </select>
              <button className="btn-primary" onClick={handleInvite} disabled={!inviteEmail.trim() || inviting}>
                {inviting ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />}
              </button>
            </div>

            {membersLoading ? (
              <div style={{ textAlign: 'center', padding: '16px' }}><Loader2 size={20} className="spin" /></div>
            ) : (
              <>
                {members.length > 0 && (
                  <div className="member-list">
                    <p className="member-section-label">{tr('currentMembers')}</p>
                    {members.map(m => (
                      <div key={m.userId} className="member-row">
                        <div className="member-info">
                          <span className="member-email">{m.email}</span>
                          {m.userId === user?.id && <span className="member-you">{tr('youLabel')}</span>}
                        </div>
                        <div className="member-actions">
                          <select
                            value={m.role}
                            onChange={e => handleChangeRole(m.userId, e.target.value as MemberRole)}
                            disabled={m.userId === user?.id}
                            className={`role-select role-${m.role}`}
                          >
                            <option value="owner">{tr('ownerRoleBar')}</option>
                            <option value="worker">{tr('workerOption')}</option>
                          </select>
                          {m.userId !== user?.id && (
                            <button className="btn-danger-ghost" onClick={() => handleRemoveMember(m.userId)}>
                              <UserX size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {invitations.length > 0 && (
                  <div className="member-list">
                    <p className="member-section-label">{tr('pendingInvitations')}</p>
                    {invitations.map(inv => (
                      <div key={inv.id} className="member-row">
                        <div className="member-info">
                          <span className="member-email">{inv.invitedEmail}</span>
                          <span className="invite-pending-badge">{inv.role} · pending</span>
                        </div>
                        <button className="btn-danger-ghost" onClick={() => handleCancelInvite(inv.id)}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {members.length === 0 && invitations.length === 0 && (
                  <p style={{ fontSize: '13px', color: '#718096', textAlign: 'center', padding: '12px 0' }}>
                    {tr('noMembersYet')}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state"><Loader2 size={32} className="spin" /><p>{tr('loading')}</p></div>
      ) : (
        <>
          {(expiredCount > 0 || soonCount > 0 || lowStockCount > 0) && (
            <div className="alerts">
              {expiredCount > 0 && (
                <div className="alert alert-expired" onClick={() => setFilter('expired')}>
                  <AlertTriangle size={16} />
                  {expiredCount} {lang === 'th' ? tr('expiredItemsLabel') : `expired item${expiredCount !== 1 ? 's' : ''}`}
                </div>
              )}
              {soonCount > 0 && (
                <div className="alert alert-soon" onClick={() => setFilter('soon')}>
                  <Clock size={16} />
                  {soonCount} {tr('expiringSoonLabel')}
                </div>
              )}
              {lowStockCount > 0 && (
                <div className="alert alert-low" onClick={() => setFilter('low')}>
                  <TrendingDown size={16} />
                  {lowStockCount} {tr('lowStockAlertLabel')}
                </div>
              )}
            </div>
          )}

          <div className="toolbar">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {filtered.length} of {products.length} {tr('productsCount')}
              </span>
              {isOwner && (
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => { setEditMode(e => !e); setSelected(new Set()); }}
                >
                  {editMode ? tr('doneBtn') : 'Edit'}
                </button>
              )}
            </div>
            <div className="search-box">
              <Search size={16} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('searchProductsPlaceholder')} />
            </div>
            <div className="filter-tabs">
              {(['all', 'expired', 'soon', 'ok', 'low'] as FilterType[]).map(f => (
                <button key={f}
                  className={`filter-tab ${filter === f ? 'active' : ''} filter-${f}`}
                  onClick={() => setFilter(f)}>
                  {f === 'all' ? tr('filterAll') : f === 'expired' ? tr('filterExpired') : f === 'soon' ? tr('filterSoon') : f === 'ok' ? tr('filterOk') : tr('filterLow')}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <Package size={48} strokeWidth={1} />
              <p>{products.length === 0 ? tr('noProductsYet') : tr('noProductsMatch')}</p>
              {products.length === 0 && (
                <button className="btn-primary" onClick={() => navigate(`/store/${storeId}/scan`)}>
                  <ScanLine size={16} /> {tr('startScanningBtn')}
                </button>
              )}
            </div>
          ) : (
            <>
            {editMode && filtered.length > 0 && (
              <div className="bulk-select-bar">
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    if (selected.size === filtered.length) {
                      setSelected(new Set());
                    } else {
                      setSelected(new Set(filtered.map(p => p.id)));
                    }
                  }}
                >
                  {selected.size === filtered.length ? 'Deselect All' : 'Select All'}
                </button>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {selected.size} selected
                </span>
              </div>
            )}
            <div className="card-list">
              {filtered.map(product => {
                const status = getExpiryStatus(product.expiryDate);
                return (
                  <div key={product.id}
                    className={`card card-product expiry-${status}${editMode && selected.has(product.id) ? ' card-selected' : ''}`}
                    onClick={() => {
                      if (editMode) {
                        setSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(product.id)) next.delete(product.id);
                          else next.add(product.id);
                          return next;
                        });
                      } else {
                        navigate(`/store/${storeId}/product/${product.id}`);
                      }
                    }}>
                    <div className="card-body">
                      {editMode && (
                        <input
                          type="checkbox"
                          className="bulk-checkbox"
                          checked={selected.has(product.id)}
                          onChange={() => {}}
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                      <div className={`expiry-badge badge-${status}`}>
                        {status === 'expired' ? <AlertTriangle size={14} /> :
                          status === 'soon' ? <Clock size={14} /> :
                            status === 'ok' ? <CheckCircle size={14} /> : <Package size={14} />}
                      </div>
                      <div className="card-info">
                        <h3>{product.name}</h3>
                        <div className="card-meta">
                          <span>{product.category}</span>
                          {product.barcode && <span>#{product.barcode}</span>}
                          <span>
                            {tr('qtyPrefix')} {product.quantity} {product.unit}
                            {isLowStock(product) && <span className="low-badge">{tr('lowBadge')}</span>}
                          </span>
                        </div>
                        <div className={`expiry-text text-${status}`}>
                          {status === 'expired' ? tr('expiredPrefix') : tr('expiresPrefix')}{' '}
                          {formatDate(product.expiryDate)}
                        </div>
                      </div>
                      <div className="card-actions">
                        {/* Only owners see the delete button */}
                        {isOwner && !editMode && (
                          <button className="btn-danger-ghost" onClick={e => handleDeleteProduct(product.id, e)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                        <ChevronRight size={18} className="chevron" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}

        </>
      )}

      {editMode && selected.size > 0 && (
        <div className="bulk-delete-bar">
          <button
            className="btn-danger full-width"
            disabled={deleting}
            onClick={async () => {
              if (!confirm(`Delete ${selected.size} product${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
              setDeleting(true);
              try {
                await Promise.all(Array.from(selected).map(id => deleteProduct(id)));
                setProducts(prev => prev.filter(p => !selected.has(p.id)));
                setSelected(new Set());
                setEditMode(false);
              } catch (e) { setError(errMsg(e)); }
              finally { setDeleting(false); }
            }}
          >
            {deleting
              ? <><Loader2 size={16} className="spin" /> Deleting…</>
              : <><Trash2 size={16} /> Delete ({selected.size})</>}
          </button>
        </div>
      )}

      <StoreTabBar storeId={storeId!} />
    </div>
  );
}
