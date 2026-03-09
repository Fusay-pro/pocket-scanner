import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Package, ShoppingCart, BarChart2, Settings } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { t } from '../i18n';
import { getStoreRole } from '../utils/storage';
import { isSupabaseConfigured } from '../lib/supabase';

interface Props {
  storeId: string;
}

export default function StoreTabBar({ storeId }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { lang } = useSettings();
  const [isOwner, setIsOwner] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getStoreRole(storeId).then(r => setIsOwner(r === 'owner'));
  }, [storeId]);

  const tabs = [
    { key: 'products',  label: t(lang, 'tabProducts'),  icon: Package,      path: `/store/${storeId}` },
    { key: 'sell',      label: t(lang, 'tabSell'),      icon: ShoppingCart, path: `/store/${storeId}/sell` },
    ...(isOwner ? [{ key: 'analytics', label: t(lang, 'tabAnalytics'), icon: BarChart2, path: `/store/${storeId}/analytics` }] : []),
    { key: 'settings',  label: t(lang, 'tabSettings'),  icon: Settings,     path: `/store/${storeId}/settings` },
  ];

  function activeKey() {
    if (pathname.endsWith('/sell'))      return 'sell';
    if (pathname.endsWith('/analytics')) return 'analytics';
    if (pathname.endsWith('/settings'))  return 'settings';
    return 'products';
  }

  const current = activeKey();

  return (
    <nav className="store-tab-bar">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = tab.key === current;
        return (
          <button
            key={tab.key}
            className={`store-tab ${isActive ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <Icon size={20} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
