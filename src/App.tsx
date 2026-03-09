import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { isSupabaseConfigured } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import StoreList from './pages/StoreList';
import StorePage from './pages/StorePage';
import ScanPage from './pages/ScanPage';
import ProductPage from './pages/ProductPage';
import SellPage from './pages/SellPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import { Loader2 } from 'lucide-react';
import './App.css';

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Loader2 size={32} className="spin" />
      </div>
    );
  }

  if (!isSupabaseConfigured || user) {
    return (
      <Routes>
        <Route path="/" element={<StoreList />} />
        <Route path="/store/:storeId" element={<StorePage />} />
        <Route path="/store/:storeId/scan" element={<ScanPage />} />
        <Route path="/store/:storeId/sell" element={<SellPage />} />
        <Route path="/store/:storeId/analytics" element={<AnalyticsPage />} />
        <Route path="/store/:storeId/settings" element={<SettingsPage />} />
        <Route path="/store/:storeId/product/:productId" element={<ProductPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <AuthProvider>
          <ProtectedRoutes />
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}
