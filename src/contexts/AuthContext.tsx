/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export type Role = 'owner' | 'worker';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** role cache: storeId → role */
  roles: Record<string, Role>;
  getRole: (storeId: string) => Role | null;
  refreshRole: (storeId: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [roles, setRoles] = useState<Record<string, Role>>({});

  /** Auto-accept any pending invitations for this user's email */
  async function acceptPendingInvitations(email: string) {
    if (!email) return;
    const { data: invites } = await supabase
      .from('store_invitations')
      .select('*')
      .eq('invited_email', email);

    if (!invites || invites.length === 0) return;

    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;

    for (const inv of invites) {
      await supabase.from('store_members').insert({
        store_id: inv.store_id,
        user_id: uid,
        role: inv.role,
      }).select(); // ignore duplicate errors
      await supabase.from('store_invitations').delete().eq('id', inv.id);
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    // Get current session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) {
        acceptPendingInvitations(data.session.user.email ?? '');
      }
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setRoles({});
      if (sess?.user) {
        acceptPendingInvitations(sess.user.email ?? '');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function refreshRole(storeId: string) {
    if (!user) return;
    const { data } = await supabase
      .from('store_members')
      .select('role')
      .eq('store_id', storeId)
      .eq('user_id', user.id)
      .single();
    if (data) {
      setRoles(prev => ({ ...prev, [storeId]: data.role as Role }));
    }
  }

  function getRole(storeId: string): Role | null {
    return roles[storeId] ?? null;
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setRoles({});
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, getRole, refreshRole, signIn, signUp, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
